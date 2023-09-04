import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { CfnApiKey, CfnDataSource, CfnGraphQLApi, CfnGraphQLSchema, CfnResolver, FieldLogLevel, GraphqlApi, LogConfig } from 'aws-cdk-lib/aws-appsync';

import { Construct } from 'constructs';

export class MergedApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const servicaAApId = ssm.StringParameter.valueForStringParameter(
      this, '/serviceA/graphQlApiId');     

    const servicaBApId = ssm.StringParameter.valueForStringParameter(
        this, '/serviceB/graphQlApiId');     

    //look up for existing apis to be federated
    const serviceAApis = GraphqlApi.fromGraphqlApiAttributes(this, 'serviceAApis', {
      graphqlApiId: servicaAApId,
    });

    const serviceBApis = GraphqlApi.fromGraphqlApiAttributes(this, 'serviceBApis', {
      graphqlApiId: servicaBApId,
    });
  }
}
