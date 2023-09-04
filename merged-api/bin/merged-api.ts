#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { MergedApiStack } from '../lib/merged-api-stack';

const app = new cdk.App();
new MergedApiStack(app, 'MergedApiStack');