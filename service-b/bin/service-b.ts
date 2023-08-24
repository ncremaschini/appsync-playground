#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { ServiceBStack } from '../lib/service-b-stack';

const app = new cdk.App();
new ServiceBStack(app, 'ServiceBStack');