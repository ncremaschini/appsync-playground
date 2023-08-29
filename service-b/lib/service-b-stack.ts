import cdk = require('aws-cdk-lib');

import * as logs from 'aws-cdk-lib/aws-logs';

import { AttributeType, BillingMode, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { CfnApiKey, CfnDataSource, CfnGraphQLApi, CfnGraphQLSchema, CfnResolver, FieldLogLevel, LogConfig } from 'aws-cdk-lib/aws-appsync';
import { IResource, LambdaIntegration, MockIntegration, PassthroughBehavior, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';

import { Construct } from 'constructs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { aws_apigateway } from 'aws-cdk-lib';
import { join } from 'path'

export class ServiceBStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tableName = "serviceBItems";

    const { itemsTable, itemsTableRole } = this.createTable(tableName);

    const nodeJsFunctionProps: NodejsFunctionProps = this.defineFunctionsProps(tableName, itemsTable);
    
    const { getAllIntegration, createOneIntegration, getOneIntegration, updateOneIntegration, deleteOneIntegration } = this.createFunctions(nodeJsFunctionProps, itemsTable);

    const { restApiKey, api: restApi, Role: restApiServiceRole } = this.createRestApi(getAllIntegration, createOneIntegration, getOneIntegration, updateOneIntegration, deleteOneIntegration);

    const { httpGraphQLApi: httpGraphQLApi, apiKey: graphQlapiKey } = this.createGraphQlApi();

    const apiSchema = this.createGraphQlSchema(httpGraphQLApi, tableName);    

    const dataSource = this.createGraphQlDatasource(httpGraphQLApi, restApi, restApiServiceRole);

    this.createGraphQlResolvers(httpGraphQLApi, dataSource, tableName, apiSchema,restApiKey);

    this.createStackOutputs(restApiKey, httpGraphQLApi, graphQlapiKey);

  }

  private createStackOutputs(restApiKey: cdk.aws_apigateway.ApiKey, itemsGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, apiKey: cdk.aws_appsync.CfnApiKey) {
    
    new cdk.CfnOutput(this, 'serviceBRestApiKeyOut', {
      value: restApiKey.keyId,
      description: 'rest api key',
      exportName: 'serviceBRestApiKey',
    });

    new cdk.CfnOutput(this, 'GraphQlApiUrl', {
      value: itemsGraphQLApi.attrGraphQlUrl,
      description: 'Graphql invocation url',
      exportName: 'ServiceBGraphQlApiUrl',
    });

    new cdk.CfnOutput(this, 'serviceBGraphQlApiKeyOut', {
      value: apiKey.attrApiKey,
      description: 'graphQl api key',
      exportName: 'serviceBGraphQlApiKey',
    });
  }

  private createRestApi(getAllIntegration: cdk.aws_apigateway.LambdaIntegration, createOneIntegration: cdk.aws_apigateway.LambdaIntegration, getOneIntegration: cdk.aws_apigateway.LambdaIntegration, updateOneIntegration: cdk.aws_apigateway.LambdaIntegration, deleteOneIntegration: cdk.aws_apigateway.LambdaIntegration) {
    const restApi = new RestApi(this, 'serviceBRestApi', {
      restApiName: 'serviceBApi',
      cloudWatchRole: true,
    });

    const stage = restApi.deploymentStage!.node.defaultChild as cdk.aws_apigateway.CfnStage;
    const logGroup = new logs.LogGroup(restApi, 'AccessLogs', {
      logGroupName: "/aws/apigateway/" + restApi.restApiId + "/access_logs",
      retention: 1, 
    });

    stage.tracingEnabled = true;

    stage.accessLogSetting = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        userAgent: '$context.identity.userAgent',
        sourceIp: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        path: '$context.path',
        status: '$context.status',
        responseLength: '$context.responseLength',
      }),
    };

    logGroup.grantWrite(new ServicePrincipal('apigateway.amazonaws.com'));

    const apiKeyName = "rest-dev-key";

    const restApiKey = new aws_apigateway.ApiKey(this, `RestAPIkey`, {
      apiKeyName,
      description: `Rest APIKey of service B`,
      enabled: true,
    });

    const usagePlanProps: aws_apigateway.UsagePlanProps = {
      name: "devUsagePlan",
      apiStages: [{ api: restApi, stage: restApi.deploymentStage }],
      throttle: { burstLimit: 500, rateLimit: 1000 }, quota: { limit: 10000000, period: Period.MONTH }
    };

    restApi.addUsagePlan(`devUsagePlan`, usagePlanProps).addApiKey(restApiKey);

    const items = restApi.root.addResource('items');
    items.addMethod('GET', getAllIntegration);
    items.addMethod('POST', createOneIntegration);
    addCorsOptions(items);

    const singleItem = items.addResource('{id}');
    singleItem.addMethod('GET', getOneIntegration);
    singleItem.addMethod('PATCH', updateOneIntegration);
    singleItem.addMethod('DELETE', deleteOneIntegration);
    addCorsOptions(singleItem);

    const restApiServiceRole = new Role(this, "serviceBRestApiServiceRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    restApiServiceRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonAPIGatewayInvokeFullAccess")
    );
 
    return {restApiKey, api: restApi, Role: restApiServiceRole};
  }

  private createFunctions(nodeJsFunctionProps: cdk.aws_lambda_nodejs.NodejsFunctionProps, itemsTable: cdk.aws_dynamodb.Table) {
    const getOneLambda = new NodejsFunction(this, 'getOneItemFunction', {
      entry: join(__dirname, 'lambdas', 'get-one.ts'),
      ...nodeJsFunctionProps,
    });
    const getAllLambda = new NodejsFunction(this, 'getAllItemsFunction', {
      entry: join(__dirname, 'lambdas', 'get-all.ts'),
      ...nodeJsFunctionProps,
    });
    const createOneLambda = new NodejsFunction(this, 'createItemFunction', {
      entry: join(__dirname, 'lambdas', 'create.ts'),
      ...nodeJsFunctionProps,
    });
    const updateOneLambda = new NodejsFunction(this, 'updateItemFunction', {
      entry: join(__dirname, 'lambdas', 'update-one.ts'),
      ...nodeJsFunctionProps,
    });
    const deleteOneLambda = new NodejsFunction(this, 'deleteItemFunction', {
      entry: join(__dirname, 'lambdas', 'delete-one.ts'),
      ...nodeJsFunctionProps,
    });

    // Grant the Lambda function read access to the DynamoDB table
    itemsTable.grantReadWriteData(getAllLambda);
    itemsTable.grantReadWriteData(getOneLambda);
    itemsTable.grantReadWriteData(createOneLambda);
    itemsTable.grantReadWriteData(updateOneLambda);
    itemsTable.grantReadWriteData(deleteOneLambda);

    // Integrate the Lambda functions with the API Gateway resource
    const getAllIntegration = new LambdaIntegration(getAllLambda);
    const createOneIntegration = new LambdaIntegration(createOneLambda);
    const getOneIntegration = new LambdaIntegration(getOneLambda);
    const updateOneIntegration = new LambdaIntegration(updateOneLambda);
    const deleteOneIntegration = new LambdaIntegration(deleteOneLambda);
    return { getAllIntegration, createOneIntegration, getOneIntegration, updateOneIntegration, deleteOneIntegration };
  }

  private defineFunctionsProps(tableName: string, itemsTable: cdk.aws_dynamodb.Table): cdk.aws_lambda_nodejs.NodejsFunctionProps {
    return {
      bundling: {
        externalModules: [],
      },
      depsLockFilePath: join(__dirname, 'lambdas', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: `${tableName}Id`,
        TABLE_NAME: itemsTable.tableName,
      },
      runtime: Runtime.NODEJS_18_X,
      logRetention: logs.RetentionDays.ONE_DAY
    };
  }

  private createTable(tableName: string) {
    const itemsTable = new Table(this, "serviceBItems", {
      tableName: tableName,
      partitionKey: {
        name: `${tableName}Id`,
        type: AttributeType.STRING,
      },
      encryption: TableEncryption.AWS_MANAGED,
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const itemsTableRole = new Role(this, "serviceBItemsDynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    itemsTableRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );
    return { itemsTable, itemsTableRole };
  }

  private createGraphQlApi() {

    const cloudWatchLogsRole = new Role(this, "ServiceBApiCloudWatchRole", {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppSyncPushToCloudWatchLogs')]
    })

    const httpGraphQLApi = new CfnGraphQLApi(this, "serviceBGraphQlApi", {
      name: "serviceBApi",
      authenticationType: "API_KEY",
      logConfig: {
        fieldLogLevel: FieldLogLevel.ERROR,
        cloudWatchLogsRoleArn: cloudWatchLogsRole.roleArn
      }
    });

    const apiKey = new CfnApiKey(this, "ServiceBApiKey", {
      apiId: httpGraphQLApi.attrApiId,
    });
    return { httpGraphQLApi: httpGraphQLApi, apiKey };
  }

  private createGraphQlResolvers(httpGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, dataSource: cdk.aws_appsync.CfnDataSource, tableName: string, apiSchema: cdk.aws_appsync.CfnGraphQLSchema, restApiKey: cdk.aws_apigateway.ApiKey) {
    const getOneResolver = new CfnResolver(this, "GetOneQueryResolver", {
      apiId: httpGraphQLApi.attrApiId,
      typeName: "Query",
      fieldName: "getOne",
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
          "version": "2018-05-29",
          "method": "GET",
          "params": {
            "headers": {
              "Content-Type" : "application/json",
              "x-api-key": "${restApiKey.keyId}"
            } 
          },
          "resourcePath": $util.toJson("/items/$ctx.args.serviceBItemsId")
      }`,
      responseMappingTemplate: `
        ## Raise a GraphQL field error in case of a datasource invocation error
        #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
        #end
        ## if the response status code is not 200, then return an error. Else return the body **
        #if($ctx.result.statusCode == 200)
            ## If response is 200, return the body.
            $ctx.result.body
        #else
            ## If response is not 200, append the response to error block.
            $utils.appendError($ctx.result.body, "$ctx.result.statusCode")
        #end`,
    });
    getOneResolver.addDependency(apiSchema);
    getOneResolver.addDependency(dataSource);
  }

  private createGraphQlDatasource(httpGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, restApi: RestApi, restApiServiceRole: cdk.aws_iam.Role) {
    return new CfnDataSource(this, "ServiceBHttpDataSource", {
      apiId: httpGraphQLApi.attrApiId,
      name: "ServiceBHttpDataSource",
      type: "HTTP",
      httpConfig: {
        endpoint: restApi.url,
      },
      serviceRoleArn: restApiServiceRole.roleArn,
    });
  }

  private createGraphQlSchema(itemsGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, serviceBName: string) {
    return new CfnGraphQLSchema(this, "serviceBschema", {
      apiId: itemsGraphQLApi.attrApiId,
      definition: `type ${serviceBName} {
        ${serviceBName}Id: ID!
        name: String
      }
      type Paginated${serviceBName} {
        items: [${serviceBName}!]!
        nextToken: String
      }
      type Query {
        all(limit: Int, nextToken: String): Paginated${serviceBName}!
        getOne(${serviceBName}Id: ID!): ${serviceBName}
      }
      type Schema {
        query: Query
      }`,
    });
  }
}

export function addCorsOptions(apiResource: IResource) {
  apiResource.addMethod('OPTIONS', new MockIntegration({
    // In case you want to use binary media types, uncomment the following line
    // contentHandling: ContentHandling.CONVERT_TO_TEXT,
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Credentials': "'false'",
        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
      },
    }],
    // In case you want to use binary media types, comment out the following line
    passthroughBehavior: PassthroughBehavior.NEVER,
    requestTemplates: {
      "application/json": "{\"statusCode\": 200}"
    },
  }), {
    methodResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': true,
        'method.response.header.Access-Control-Allow-Methods': true,
        'method.response.header.Access-Control-Allow-Credentials': true,
        'method.response.header.Access-Control-Allow-Origin': true,
      },
    }]
  })
}

