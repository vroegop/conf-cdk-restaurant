import {RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Bucket, BucketAccessControl} from 'aws-cdk-lib/aws-s3';
import {BucketDeployment, Source} from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import {AllowedMethods, CachePolicy, Distribution, OriginAccessIdentity} from 'aws-cdk-lib/aws-cloudfront';
import {RestApiOrigin, S3Origin} from 'aws-cdk-lib/aws-cloudfront-origins';
import {Certificate} from 'aws-cdk-lib/aws-certificatemanager';
import {ARecord, HostedZone, RecordTarget} from 'aws-cdk-lib/aws-route53';
import {CloudFrontTarget} from 'aws-cdk-lib/aws-route53-targets';
import {LambdaRestApi} from "aws-cdk-lib/aws-apigateway";
import {subdomain} from '../settings';

interface ConfCdkRestaurantFrontendProps extends StackProps {
    confCdkRestaurantDistributionCertificate: Certificate;
    eventApi: LambdaRestApi;
    settingsApi: LambdaRestApi;
}

export class ConfCdkRestaurantFrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: ConfCdkRestaurantFrontendProps) {
    super(scope, id, props);

        // Point to existing hosted zone
        const hostedZone = HostedZone.fromLookup(this, 'cloud101HostedZone', {
            domainName: 'cloud101.nl',
        });

        // Create a bucket in which we can place our website
        const bucket = new Bucket(this, 'Bucket', {
            bucketName: subdomain + '.cloud101.nl',
            accessControl: BucketAccessControl.PRIVATE,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        // Deploy the website to the bucket
        new BucketDeployment(this, 'BucketDeployment', {
            destinationBucket: bucket,
            sources: [Source.asset(path.resolve(__dirname, '../src/website/dist'))],
            retainOnDelete: false,
        });

        // Grant access to the bucket for the distribution
        const originAccessIdentity = new OriginAccessIdentity(this, 'OriginAccessIdentity');
        bucket.grantRead(originAccessIdentity);

        // Make a cloudfront distribution (CDN) to access the bucket without public access
        const distribution = new Distribution(this, 'Distribution', {
            defaultRootObject: 'index.html',
            defaultBehavior: {
                origin: new S3Origin(bucket, {originAccessIdentity}),
                // Cache disabled is *not* recommended here, instead removing cache on deployments via pipeline is desired
                cachePolicy: CachePolicy.CACHING_DISABLED,
            },
            domainNames: [subdomain + '.cloud101.nl'],
            certificate: props?.confCdkRestaurantDistributionCertificate,
            additionalBehaviors: {
                '/api/restaurant': {
                    origin: new RestApiOrigin(props.eventApi),
                    allowedMethods: AllowedMethods.ALLOW_ALL,
                    // Cache disabled is recommended here
                    cachePolicy: CachePolicy.CACHING_DISABLED,
                },
                '/api/settings': {
                    origin: new RestApiOrigin(props.settingsApi),
                    allowedMethods: AllowedMethods.ALLOW_ALL,
                    // Cache disabled is recommended here
                    cachePolicy: CachePolicy.CACHING_DISABLED,
                },
            },
        });

        new ARecord(this, 'AliasRecord', {
            recordName: subdomain + '.cloud101.nl.',
            zone: hostedZone,
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });

        // Destroy distribution on stack removal
        distribution.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
}
