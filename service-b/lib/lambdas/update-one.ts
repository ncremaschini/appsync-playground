import * as AWS from 'aws-sdk';

const TABLE_NAME = process.env.TABLE_NAME || '';
const PRIMARY_KEY = process.env.PRIMARY_KEY || '';

const db = new AWS.DynamoDB.DocumentClient();

export const handler = async (event: any = {}): Promise<any> => {

  if (!event.body) {
    return { statusCode: 400, body: 'invalid request, you are missing the parameter body' };
  }

  const editedItemId = event.pathParameters.id;
  if (!editedItemId) {
    return { statusCode: 400, body: 'invalid request, you are missing the path parameter id' };
  }

  const editedItem: any = typeof event.body == 'object' ? event.body : JSON.parse(event.body);
  const editedItemProperties = Object.keys(editedItem);
  if (!editedItem || editedItemProperties.length < 1) {
    return { statusCode: 400, body: 'invalid request, no arguments provided' };
  }

  const firstProperty = editedItemProperties.splice(0, 1);
  const params: any = {
    TableName: TABLE_NAME,
    Key: {
      [PRIMARY_KEY]: editedItemId
    },
    UpdateExpression: `set ${firstProperty} = :${firstProperty}`,
    ExpressionAttributeValues: {},
    ReturnValues: 'UPDATED_NEW'
  }
  params.ExpressionAttributeValues[`:${firstProperty}`] = editedItem[`${firstProperty}`];

  editedItemProperties.forEach(property => {
    params.UpdateExpression += `, ${property} = :${property}`;
    params.ExpressionAttributeValues[`:${property}`] = editedItem[property];
  });

  try {
    await db.update(params).promise();
    return { statusCode: 204, body: '' };
  } catch (dbError) {
    return { statusCode: 500, body: JSON.stringify(dbError) };
  }
};