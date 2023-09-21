import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { Construct } from 'constructs';

export class MergedApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const { servicaAApId, servicaBApId } = this.getFederatedApiIds(); 
  
    const { serviceAApi, serviceBApi} = this.lookupApis(servicaAApId, servicaBApId);

    const mergedApiExecutionRole = this.createExecutionRole();
  
    this.createDatasources(serviceAApi, serviceBApi);

    const logConfig: appsync.LogConfig = {
      retention: logs.RetentionDays.ONE_DAY,
    };
    
    const api = new appsync.GraphqlApi(this, 'MergedApi', {
      name: 'merged-api',
      logConfig,
      
      definition: appsync.Definition.fromSourceApis({
        sourceApis: [
          {
            sourceApi: serviceAApi,
            mergeType: appsync.MergeType.AUTO_MERGE,
          },
          {
            sourceApi: serviceBApi,
            mergeType: appsync.MergeType.AUTO_MERGE,
          },
        ],
        mergedApiExecutionRole: mergedApiExecutionRole
      }),
    }); 
  }

  private getFederatedApiIds() {
    const servicaAApId = ssm.StringParameter.valueForStringParameter(
      this, '/serviceA/graphQlApiId');

    const servicaBApId = ssm.StringParameter.valueForStringParameter(
      this, '/serviceB/graphQlApiId');
      
    return { servicaAApId, servicaBApId };
  }

  private lookupApis(servicaAApId: string, servicaBApId: string) {
    const serviceAApi = appsync.GraphqlApi.fromGraphqlApiAttributes(this, 'serviceAApis', {
      graphqlApiId: servicaAApId,
    }) as appsync.GraphqlApi;

    const serviceBApi = appsync.GraphqlApi.fromGraphqlApiAttributes(this, 'serviceBApis', {
      graphqlApiId: servicaBApId,
    }) as appsync.GraphqlApi;

    return { serviceAApi, serviceBApi};
  }

  private createDatasources(serviceAApi: appsync.IGraphqlApi, serviceBApi: appsync.IGraphqlApi) {
    serviceAApi.addNoneDataSource('ServiceADS', {
      name: cdk.Lazy.string({ produce(): string { return 'ServiceADS'; } }),
    });

    serviceBApi.addNoneDataSource('ServiceBDS', {
      name: cdk.Lazy.string({ produce(): string { return 'ServiceBDS'; } }),
    });
  }

  private createExecutionRole() {
    return new iam.Role(this, 'MergedApiExecutionRole', {
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com'),
      inlinePolicies: {
        appsync: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ["*"],
              actions: ["appsync:*"]
            })
          ]
        })
      }
    });
  }
}