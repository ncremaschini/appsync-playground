#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { ServiceAStack } from '../lib/service-a-stack';

const app = new cdk.App();
new ServiceAStack(app, 'ServiceAStack');