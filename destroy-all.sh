cd merged-api && cdk destroy --profile nico --force

cd ../service-a && cdk destroy --profile nico --force

cd ../service-b && cdk destroy --profile nico --force