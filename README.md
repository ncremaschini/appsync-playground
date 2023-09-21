# appsync-playground
Just my playground to play around with appsync and CDK, focusing on federation and merged apis

The system is composed by two services, called `serviceA, serviceB ` exposing their own graphQl Schema.
Then a third service, called `mergedApi` is exposing a merged graphQl Schema, which is a federation of the two services.

![Alt text](appsync_federation.png?raw=true "Title")

## ServiceA
ServiceA is made by AppSync for Api exposition and DynamoDB as datalayer. It levearages on native integration between Appsync and DynamoDB

## ServiceB
ServiceB is made by AppSync for Api exposition in front of a Api gateway connetect as HTTP endpoint, and lambda querying a DynamoDB as datalayer.

## Merged api
Merged api is made by AppSync for Api exposition and has serviceA and serviceB as federated data sources.

# Get started
Each service has its own folder, and has to be installed, built and deployed indipendently.

## Prerequisites
- nodejs v20.0.0
- aws-cdk@2.95.0
- esbuild@0.19.2

## Deploy
Each service has to be deployed indipendently, starting from serviceA, then serviceB and finally mergedApi.

