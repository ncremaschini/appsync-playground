import cdk = require('aws-cdk-lib');

import * as ssm from 'aws-cdk-lib/aws-ssm';

import { AttributeType, BillingMode, CfnTable, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { CfnApiKey, CfnDataSource, CfnGraphQLApi, CfnGraphQLSchema, CfnResolver, FieldLogLevel, LogConfig } from 'aws-cdk-lib/aws-appsync';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

export class ServiceAStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tableName = "serviceAItems";

    const { itemsTable, itemsTableRole } = this.createTable(tableName);

    const { itemsGraphQLApi, apiKey } = this.createGraphQlApi();

    const apiSchema = this.createGraphQlSchema(itemsGraphQLApi, tableName);    

    const dataSource = this.createGraphQlDatasource(itemsGraphQLApi, itemsTable, itemsTableRole);

    this.createGraphQlResolvers(itemsGraphQLApi, dataSource, tableName, apiSchema);

    this.createStackOutputs(itemsGraphQLApi, apiKey);
  }

  private createTable(tableName: string) {
    const itemsTable = new Table(this, "serviceAItems", {
      tableName: tableName,
      partitionKey: {
        name: `id`,
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
    return { itemsTable, itemsTableRole };
  }

  private createGraphQlApi() {

    const cloudWatchLogsRole = new Role(this, "ServiceAApiCloudWatchRole", {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppSyncPushToCloudWatchLogs')]
    })

    
    const itemsGraphQLApi = new CfnGraphQLApi(this, "serviceAApi", {
      name: "serviceAApi",
      authenticationType: "API_KEY",
      logConfig: {
        fieldLogLevel: FieldLogLevel.ERROR,
        cloudWatchLogsRoleArn: cloudWatchLogsRole.roleArn
      }
    });

    const apiKey = new CfnApiKey(this, "ServiceAApiKey", {
      apiId: itemsGraphQLApi.attrApiId,
    });

    //store api id into ssm
    new ssm.StringParameter(this, 'serviceAApiIdParam', {
      parameterName: '/serviceA/graphQlApiId',
      stringValue: itemsGraphQLApi.attrApiId,
      description: 'Service A graphQl Api id',
      dataType: ssm.ParameterDataType.TEXT,
      tier: ssm.ParameterTier.STANDARD,
      allowedPattern: '.*',
    });

    return { itemsGraphQLApi, apiKey };
  }

  private createGraphQlSchema(itemsGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, tableName: string) {
    return new CfnGraphQLSchema(this, "serviceAschema", {
      apiId: itemsGraphQLApi.attrApiId,
      definition: `type ${tableName} {
        id: ID!
        name: String
      }
      type Paginated${tableName} {
        items: [${tableName}!]!
        nextToken: String
      }
      type Query {
        all(limit: Int, nextToken: String): Paginated${tableName}! @renamed(to: "all${tableName}")
        getOne(id: ID!): ${tableName} @renamed(to: "getOne${tableName}")
      }
      type Mutation {
        save(name: String!): ${tableName} @renamed(to: "save${tableName}")
        delete(id: ID!): ${tableName} @renamed(to: "delete${tableName}")
      }
      type Schema {
        query: Query
        mutation: Mutation
      }`,
    });
  }

  private createGraphQlDatasource(itemsGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, itemsTable: cdk.aws_dynamodb.Table, itemsTableRole: cdk.aws_iam.Role) {
    return new CfnDataSource(this, "ServiceAItemsDataSource", {
      apiId: itemsGraphQLApi.attrApiId,
      name: "ServiceAItemsDataSource",
      type: "AMAZON_DYNAMODB",
      dynamoDbConfig: {
        tableName: itemsTable.tableName,
        awsRegion: this.region,
      },
      serviceRoleArn: itemsTableRole.roleArn,
    });
  }

  private createGraphQlResolvers(itemsGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, dataSource: cdk.aws_appsync.CfnDataSource, tableName: string, apiSchema: cdk.aws_appsync.CfnGraphQLSchema) {
    const getOneResolver = new CfnResolver(this, "GetOneQueryResolver", {
      apiId: itemsGraphQLApi.attrApiId,
      typeName: "Query",
      fieldName: "getOne",
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "GetItem",
        "key": {
          "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
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
          "id": { "S": "$util.autoId()" }
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
          "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`,
    });
    deleteResolver.addDependency(apiSchema);
    deleteResolver.addDependency(dataSource);
  }

  private createStackOutputs(itemsGraphQLApi: cdk.aws_appsync.CfnGraphQLApi, apiKey: cdk.aws_appsync.CfnApiKey) {
    new cdk.CfnOutput(this, 'apiUrl', {
      value: itemsGraphQLApi.attrGraphQlUrl,
      description: 'Graphql invocation url',
      exportName: 'apiUrl',
    });
  }
}
