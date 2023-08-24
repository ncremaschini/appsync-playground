import cdk = require('aws-cdk-lib');

import { AttributeType, BillingMode, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
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

    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      depsLockFilePath: join(__dirname, 'lambdas', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'itemId',
        TABLE_NAME: itemsTable.tableName,
      },
      runtime: Runtime.NODEJS_18_X,
    }

    console.log(__dirname);
    
    // Create a Lambda function for each of the CRUD operations
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


    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, 'serviceBApi', {
      restApiName: 'serviceBApi'
    });

    const apiKeyName = "dev-key"

    const apiKey = new aws_apigateway.ApiKey(this, `APIkey`, {
      apiKeyName,
      description: `APIKey used by my api to do awesome stuff`,
      enabled: true,
    })

    new cdk.CfnOutput(this, 'apiKey', {
      value: apiKey.keyId,
      description: 'api key',
      exportName: 'apiKey',
    });

    const usagePlanProps: aws_apigateway.UsagePlanProps = {
      name: "devUsagePlan",
      apiStages: [{api: api, stage: api.deploymentStage}],
      throttle: {burstLimit: 500, rateLimit: 1000}, quota: {limit: 10000000, period: Period.MONTH}
    }

    api.addUsagePlan(`devUsagePlan`, usagePlanProps).addApiKey(apiKey);

    new cdk.CfnOutput(this, 'apiUrl', {
      value: api.url,
      description: 'rest api invocation url',
      exportName: 'apiUrl',
    });

    const items = api.root.addResource('items');
    items.addMethod('GET', getAllIntegration);
    items.addMethod('POST', createOneIntegration);
    addCorsOptions(items);

    const singleItem = items.addResource('{id}');
    singleItem.addMethod('GET', getOneIntegration);
    singleItem.addMethod('PATCH', updateOneIntegration);
    singleItem.addMethod('DELETE', deleteOneIntegration);
    addCorsOptions(singleItem);
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

