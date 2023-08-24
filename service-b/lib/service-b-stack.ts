import cdk = require('aws-cdk-lib');

import { AttributeType, BillingMode, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { CfnApiKey, CfnDataSource, CfnGraphQLApi, CfnGraphQLSchema, CfnResolver } from 'aws-cdk-lib/aws-appsync';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

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

    const itemsGraphQLApi = new CfnGraphQLApi(this, "serviceBApi", {
      name: "serviceBApi",
      authenticationType: "API_KEY",
    });

    new cdk.CfnOutput(this, 'apiUrl', {
      value: itemsGraphQLApi.attrGraphQlUrl,
      description: 'Graphql invocation url',
      exportName: 'apiUrl',
    });

    const apiKey = new CfnApiKey(this, "serviceBApiKey", {
      apiId: itemsGraphQLApi.attrApiId,
    });

    new cdk.CfnOutput(this, 'apiKey', {
      value: apiKey.attrApiKey,
      description: 'api key',
      exportName: 'apiKey',
    });
  }
}
