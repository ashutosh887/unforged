import { fileURLToPath } from "node:url"
import { App, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib"
import { CfnStage, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2"
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations"
import { AllowedMethods, CachePolicy, Distribution, OriginRequestPolicy, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront"
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins"
import { CfnCluster } from "aws-cdk-lib/aws-dsql"
import { PolicyStatement } from "aws-cdk-lib/aws-iam"
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3"
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment"
import type { Construct } from "constructs"

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

class UnforgedStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    const cluster = new CfnCluster(this, "Ledger", { deletionProtectionEnabled: false, tags: [{ key: "app", value: "unforged" }] })
    const endpoint = cluster.attrEndpoint

    const uploads = new Bucket(this, "Uploads", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(1) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const site = new Bucket(this, "Site", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const environment = { DSQL_ENDPOINT: endpoint, UPLOAD_BUCKET: uploads.bucketName, MODEL_ID: String(this.node.tryGetContext("modelId")) }
    const fn = (name: string, timeout: number, memorySize = 512) => {
      const f = new NodejsFunction(this, name, {
        entry: root(`src/handlers/${name.toLowerCase()}.ts`),
        projectRoot: root(""),
        depsLockFilePath: root("pnpm-lock.yaml"),
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize,
        timeout: Duration.seconds(timeout),
        environment,
        bundling: { target: "node22", minify: true, sourceMap: true, externalModules: ["pg-native"], loader: { ".sql": "text" } },
      })
      f.addToRolePolicy(new PolicyStatement({ actions: ["dsql:DbConnectAdmin", "dsql:DbConnect"], resources: [cluster.attrResourceArn] }))
      return f
    }

    const shops = fn("Shops", 10)
    const alerts = fn("Alerts", 15)
    const check = fn("Check", 29, 1024)
    const race = fn("Race", 29, 1024)
    const migrate = fn("Migrate", 120)
    const spike = fn("Spike", 29, 256)
    const verify = fn("Verify", 15, 512)

    uploads.grantPut(check)
    check.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["arn:aws:bedrock:*::foundation-model/*", Stack.of(this).formatArn({ service: "bedrock", resource: "inference-profile", resourceName: "*" })],
      }),
    )

    const api = new HttpApi(this, "Api", { createDefaultStage: true })
    const stage = api.defaultStage!.node.defaultChild as CfnStage
    stage.defaultRouteSettings = { throttlingRateLimit: 25, throttlingBurstLimit: 50 }
    const route = (path: string, f: NodejsFunction) => api.addRoutes({ path, methods: [HttpMethod.POST], integration: new HttpLambdaIntegration(`${f.node.id}Route`, f) })
    route("/api/shops", shops)
    route("/api/alerts", alerts)
    route("/api/check", check)
    route("/api/race", race)
    route("/api/spike/dkim", spike)
    route("/api/verify", verify)

    const distribution = new Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: { origin: S3BucketOrigin.withOriginAccessControl(site), viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS, cachePolicy: CachePolicy.CACHING_OPTIMIZED },
      additionalBehaviors: {
        "/api/*": {
          origin: new HttpOrigin(`${api.apiId}.execute-api.${this.region}.amazonaws.com`),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    })

    new BucketDeployment(this, "SiteDeploy", { sources: [Source.asset(root("web/dist"))], destinationBucket: site, distribution, distributionPaths: ["/*"] })

    new CfnOutput(this, "Url", { value: `https://${distribution.distributionDomainName}` })
    new CfnOutput(this, "ClusterEndpoint", { value: endpoint })
    new CfnOutput(this, "MigrateFunction", { value: migrate.functionName })
  }
}

const app = new App()
new UnforgedStack(app, "Unforged", { env: { region: "us-east-1", account: process.env.CDK_DEFAULT_ACCOUNT } })
