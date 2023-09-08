import * as ServiceA from '../lib/service-a-stack';
import * as cdk from 'aws-cdk-lib';

import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Template } from 'aws-cdk-lib/assertions';

test("All resources created", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new ServiceA.ServiceAStack(app, "TestStack");
  // THEN
  const template = Template.fromStack(stack);

  expect(template).toMatchSnapshot();

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'serviceAItems',
    KeySchema: [
        {
            "AttributeName": "id",
            "KeyType": "HASH",
        }],
    SSESpecification: {
      SSEEnabled: true
    }
  });
  template.resourceCountIs('AWS::DynamoDB::Table', 1);

  template.hasResourceProperties('AWS::AppSync::GraphQLApi', {
    Name: 'serviceAApi'
  });
  
  template.resourceCountIs('AWS::AppSync::GraphQLApi', 1);
});
