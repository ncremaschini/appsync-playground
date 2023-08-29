import * as ServiceA from '../lib/service-b-stack';
import * as cdk from 'aws-cdk-lib';

import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Template } from 'aws-cdk-lib/assertions';

test("All resources created", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new ServiceA.ServiceBStack(app, "TestStack");
  // THEN
  const template = Template.fromStack(stack);

  expect(template).toMatchSnapshot();

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'serviceBItems',
    KeySchema: [
        {
            "AttributeName": "serviceBItemsId",
            "KeyType": "HASH",
        }],
    SSESpecification: {
      SSEEnabled: true
    }
  });

  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    Name: 'serviceBApi'
  });
  
  template.resourceCountIs('AWS::ApiGateway::RestApi', 1);

  template.resourceCountIs('AWS::AppSync::GraphQLApi', 1);
});
