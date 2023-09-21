# appsync-playground
Just my playground to play aroubd appsync, focusing on federation and merged apis

The system is composed by two services, called `serviceA, serviceB ` exposing their own graphQl Schema.

![Alt text](appsync_federation.png?raw=true "Title")

## ServiceA
ServiceA is made by AppSync for Api exposition and DynamoDB as datalayer. It levearages on native integration between Appsync and DynamoDB

## ServiceB
ServiceB is made by AppSync for Api exposition in front of a Api gateway connetect as HTTP endpoint, and lambda querying a DynamoDB as datalayer.
