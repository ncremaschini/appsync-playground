import cdk = require('aws-cdk-lib');

import * as logs from 'aws-cdk-lib/aws-logs';

import { AttributeType, BillingMode, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { CfnApiKey, CfnDataSource, CfnGraphQLApi, CfnGraphQLSchema, CfnResolver } from 'aws-cdk-lib/aws-appsync';
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

    const { itemsTable } = this.createTable(tableName);

    const nodeJsFunctionProps: NodejsFunctionProps = this.defineFunctionsProps(tableName, itemsTable);
    
    const { getAllIntegration, createOneIntegration, getOneIntegration, updateOneIntegration, deleteOneIntegration } = this.createFunctions(nodeJsFunctionProps, itemsTable);

    const restApiKey = this.createRestApi(getAllIntegration, createOneIntegration, getOneIntegration, updateOneIntegration, deleteOneIntegration);

    this.createStackOutputs(restApiKey);

  }

  private createStackOutputs(restApiKey: cdk.aws_apigateway.ApiKey) {
    new cdk.CfnOutput(this, 'serviceBRestApiKeyOut', {
      value: restApiKey.keyId,
      description: 'api key',
      exportName: 'serviceBRestApiKey',
    });
  }



  private createRestApi(getAllIntegration: cdk.aws_apigateway.LambdaIntegration, createOneIntegration: cdk.aws_apigateway.LambdaIntegration, getOneIntegration: cdk.aws_apigateway.LambdaIntegration, updateOneIntegration: cdk.aws_apigateway.LambdaIntegration, deleteOneIntegration: cdk.aws_apigateway.LambdaIntegration) {
    const api = new RestApi(this, 'serviceBApi', {
      restApiName: 'serviceBApi'
    });

    const apiKeyName = "rest-dev-key";

    const restApiKey = new aws_apigateway.ApiKey(this, `RestAPIkey`, {
      apiKeyName,
      description: `Rest APIKey of service B`,
      enabled: true,
    });

    const usagePlanProps: aws_apigateway.UsagePlanProps = {
      name: "devUsagePlan",
      apiStages: [{ api: api, stage: api.deploymentStage }],
      throttle: { burstLimit: 500, rateLimit: 1000 }, quota: { limit: 10000000, period: Period.MONTH }
    };

    api.addUsagePlan(`devUsagePlan`, usagePlanProps).addApiKey(restApiKey);

    const items = api.root.addResource('items');
    items.addMethod('GET', getAllIntegration);
    items.addMethod('POST', createOneIntegration);
    addCorsOptions(items);

    const singleItem = items.addResource('{id}');
    singleItem.addMethod('GET', getOneIntegration);
    singleItem.addMethod('PATCH', updateOneIntegration);
    singleItem.addMethod('DELETE', deleteOneIntegration);
    addCorsOptions(singleItem);
    return restApiKey;
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

