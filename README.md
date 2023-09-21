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

#Pitfalls
## ServiceB
### api gateway's  api key
Api Gateway has a usage plan with associated api key. this is to emulate an api that could be invoked directly throught api gateway and also through appsync.

in order to let appync to invoke api gateway, the api key has to be passed as header. This is done in appsync resolver's  request mapping template.

### api gateway invocation end poit
Api gateway has a stage, which is used to deploy the api. The stage is used to build the endpoint to invoke the api. 
If you use the invocation endpoint as is, with stage included, as http endpoint in appsync, api gateway always returns 403.

You have to set up the api gateway endpoint as http endpoint in appsync without the stage, and then add the stage in the request mapping template in `resourcePath` parameter.


## Merged api
### appsync execution role
The default provided execution role for federated appsync does not have the permission to invoke federated apis.
You have to add the permission to invoke the federated apis to the execution role, creating a custom one.

## All services
be carefull with defaults!
### log retention
The default log retention is `never expires`, so you have to set up a log retention policy for each resources. 



