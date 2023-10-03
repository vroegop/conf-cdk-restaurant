import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import {ConfCdkRestaurantFrontendStack} from "./conf-cdk-restaurant-frontend-stack";
import {ConfCdkRestaurantGlobalStack} from "./conf-cdk-restaurant.global-stack";

export class ConfCdkPipeline extends cdk.Stack {
    public subdomain: string;

    // Change the subdomain into something else for readability, this will be your subdomain. Tests will fail until you do.
    // For uniqueness, I suggest your GitHub handle.
    constructor(scope: Construct, id: string, props: cdk.StackProps, subdomain = 'restaurant-changeit') {
        super(scope, subdomain + id, props);

        this.subdomain = subdomain;

        const pipeline = new CodePipeline(this, this.subdomain + '-ConfCdkPipeline', {
            pipelineName: this.subdomain + '-ConfCdkPipeline',
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.gitHub('changeit', 'main'),
                // Build before testing because the test checks if the built files can be deployed too
                commands: ['npm ci', 'npm run build', 'npm run test', 'npx cdk synth']
            })
        });

        pipeline.addStage(new ConfCdkPipelineStage(this, this.subdomain + '-deployConfCdkStacks', {
            ...props
        }, this.subdomain));
    }
}

export class ConfCdkPipelineStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps, subdomain: string) {
        super(scope, id, props);

        const confCdkRestaurantGlobalStack = new ConfCdkRestaurantGlobalStack(this, subdomain + '-confCdkRestaurantGlobalStack', {
            ...props,
            env: {
                ...props.env,
                region: 'us-east-1'
            },
        }, subdomain);

        const confCdkRestaurantFrontendStack = new ConfCdkRestaurantFrontendStack(this, subdomain + '-confCdkRestaurantFrontendStack', {
            ...props,
            confCdkRestaurantDistributionCertificate: confCdkRestaurantGlobalStack.confCdkRestaurantDistributionCertificate,
            crossRegionReferences: true,
        }, subdomain);
    }
}