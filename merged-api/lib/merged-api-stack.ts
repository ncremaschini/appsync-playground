import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { Construct } from 'constructs';

export class MergedApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const { servicaAApId, servicaBApId } = this.getFederatedApiIds();     

    this.lookupApis(servicaAApId, servicaBApId);
  }

  private lookupApis(servicaAApId: string, servicaBApId: string) {
    const serviceAApis = appsync.GraphqlApi.fromGraphqlApiAttributes(this, 'serviceAApis', {
      graphqlApiId: servicaAApId,
    });

    const serviceBApis = appsync.GraphqlApi.fromGraphqlApiAttributes(this, 'serviceBApis', {
      graphqlApiId: servicaBApId,
    });

    //waiting for support in cdk lib!
    /* const api = new appsync.CfnGraphQLApi(this, 'MergedApi', {
      name: 'demo',
      apiSource: appsync.ApiSource.fromSourceApis({
        sourceApis: [
          {
            sourceApi: firstApi,
            mergeType: GraphqlApi.MergeType.MANUAL_MERGE,
          },
          {
            sourceApi: secondApi,
            mergeType: appsync.MergeType.AUTO_MERGE,
          },
        ],
      }),
    }); */
  }

  private getFederatedApiIds() {
    const servicaAApId = ssm.StringParameter.valueForStringParameter(
      this, '/serviceA/graphQlApiId');

    const servicaBApId = ssm.StringParameter.valueForStringParameter(
      this, '/serviceB/graphQlApiId');
    return { servicaAApId, servicaBApId };
  }
}
