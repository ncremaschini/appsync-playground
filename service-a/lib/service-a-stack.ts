import cdk = require('aws-cdk-lib');

import { AttributeType, BillingMode, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { CfnApiKey, CfnDataSource, CfnGraphQLApi, CfnGraphQLSchema, CfnResolver } from 'aws-cdk-lib/aws-appsync';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

export class ServiceAStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tableName = "serviceAItems";

    const itemsTable = new Table(this, "serviceAItems", {
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

    const itemsTableRole = new Role(this, "ServiceAItemsDynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    itemsTableRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );

    const itemsGraphQLApi = new CfnGraphQLApi(this, "serviceAApi", {
      name: "serviceAApi",
      authenticationType: "API_KEY",
    });

    new cdk.CfnOutput(this, 'apiUrl', {
      value: itemsGraphQLApi.attrGraphQlUrl,
      description: 'Graphql invocation url',
      exportName: 'apiUrl',
    });

    const apiKey = new CfnApiKey(this, "ApiKey", {
      apiId: itemsGraphQLApi.attrApiId,
    });

    new cdk.CfnOutput(this, 'serviceAApiKeyOut', {
      value: apiKey.attrApiKey,
      description: 'api key',
      exportName: 'serviceAApiKey',
    });

    const apiSchema = new CfnGraphQLSchema(this, "serviceAschema", {
      apiId: itemsGraphQLApi.attrApiId,
      definition: `type ${tableName} {
        ${tableName}Id: ID!
        name: String
      }
      type Paginated${tableName} {
        items: [${tableName}!]!
        nextToken: String
      }
      type Query {
        all(limit: Int, nextToken: String): Paginated${tableName}!
        getOne(${tableName}Id: ID!): ${tableName}
      }
      type Mutation {
        save(name: String!): ${tableName}
        delete(${tableName}Id: ID!): ${tableName}
      }
      type Schema {
        query: Query
        mutation: Mutation
      }`,
    });    

    const dataSource = new CfnDataSource(this, "ServiceAItemsDataSource", {
      apiId: itemsGraphQLApi.attrApiId,
      name: "ServiceAItemsDataSource",
      type: "AMAZON_DYNAMODB",
      dynamoDbConfig: {
        tableName: itemsTable.tableName,
        awsRegion: this.region,
      },
      serviceRoleArn: itemsTableRole.roleArn,
    });

    const getOneResolver = new CfnResolver(this, "GetOneQueryResolver", {
      apiId: itemsGraphQLApi.attrApiId,
      typeName: "Query",
      fieldName: "getOne",
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "GetItem",
        "key": {
          "${tableName}Id": $util.dynamodb.toDynamoDBJson($ctx.args.${tableName}Id)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`,
    });
    getOneResolver.addDependency(apiSchema);
    getOneResolver.addDependency(dataSource);

    const getAllResolver = new CfnResolver(this, "GetAllQueryResolver", {
      apiId: itemsGraphQLApi.attrApiId,
      typeName: "Query",
      fieldName: "all",
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "Scan",
        "limit": $util.defaultIfNull($ctx.args.limit, 20),
        "nextToken": $util.toJson($util.defaultIfNullOrEmpty($ctx.args.nextToken, null))
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`,
    });
    getAllResolver.addDependency(apiSchema);
    getAllResolver.addDependency(dataSource);

    const saveResolver = new CfnResolver(this, "SaveMutationResolver", {
      apiId: itemsGraphQLApi.attrApiId,
      typeName: "Mutation",
      fieldName: "save",
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "PutItem",
        "key": {
          "${tableName}Id": { "S": "$util.autoId()" }
        },
        "attributeValues": {
          "name": $util.dynamodb.toDynamoDBJson($ctx.args.name)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`,
    });
    saveResolver.addDependency(apiSchema);
    saveResolver.addDependency(dataSource);

    const deleteResolver = new CfnResolver(this, "DeleteMutationResolver", {
      apiId: itemsGraphQLApi.attrApiId,
      typeName: "Mutation",
      fieldName: "delete",
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "DeleteItem",
        "key": {
          "${tableName}Id": $util.dynamodb.toDynamoDBJson($ctx.args.${tableName}Id)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`,
    });
    deleteResolver.addDependency(apiSchema);
    deleteResolver.addDependency(dataSource);
  }
}
