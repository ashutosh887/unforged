#!/usr/bin/env bash
set -euo pipefail
out="${1:-docs/agent-proof/cloudtrail-unforged-agent.json}"
aws cloudtrail lookup-events \
  --region us-east-1 \
  --lookup-attributes AttributeKey=Username,AttributeValue=unforged-agent \
  --page-size 50 \
  --query 'Events[].{time:EventTime,event:EventName,source:EventSource,user:Username,resources:Resources[?ResourceType!=`"AWS::IAM::AccessKey"`].ResourceName}' \
  --output json > "$out"
python3 -c "import json,sys,collections;e=json.load(open('$out'));c=collections.Counter(x['source'] for x in e);print(len(e),'events');[print(f'  {n:5d} {s}') for s,n in c.most_common()]"
