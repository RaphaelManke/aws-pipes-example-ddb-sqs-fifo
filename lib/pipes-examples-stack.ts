import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class PipesExamplesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const role = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("pipes.amazonaws.com"),
    });

    const table = new Table(this, "Table", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    table.grantStreamRead(role);

    const targetQueue = new Queue(this, "TargetQueue", {
      fifo: true,
    });
    targetQueue.grantSendMessages(role);

    const pipeLoggroup = new LogGroup(this, "PipeLogGroup", {
      logGroupName: "PipeDdbToSqsFifo",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    pipeLoggroup.grantWrite(role);
    const pipe = new CfnPipe(this, "Pipe", {
      roleArn: role.roleArn,
      source: table.tableStreamArn!,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: "LATEST",
          maximumRetryAttempts: 3,
        },
      },
      target: targetQueue.queueArn,
      targetParameters: {
        sqsQueueParameters: {
          messageDeduplicationId: "$.eventID",
          messageGroupId: "$.dynamodb.Keys.id.S",
        },
      },

      logConfiguration: {
        level: "TRACE",
        cloudwatchLogsLogDestination: {
          logGroupArn: pipeLoggroup.logGroupArn,
        },
        includeExecutionData: ["ALL"],
      },
    });
  }
}

/* Example stream event:
[
  {
    "eventID": "47abf761f1e6b781d82c7a7a93ff769e",
    "eventName": "INSERT",
    "eventVersion": "1.1",
    "eventSource": "aws:dynamodb",
    "awsRegion": "eu-central-1",
    "dynamodb": {
      "ApproximateCreationDateTime": 1710952409,
      "Keys": { "id": { "S": "1" } },
      "NewImage": { "foo": { "S": "bar" }, "id": { "S": "1" } },
      "SequenceNumber": "100000000025043195499",
      "SizeBytes": 12,
      "StreamViewType": "NEW_AND_OLD_IMAGES"
    },
    "eventSourceARN": "arn:aws:dynamodb:eu-central-1:XXXXXXX:table/PipesExamplesStack-TableCD117FA1-9AG5HBQ5VBNT/stream/2024-03-20T16:30:16.493"
  }
]

*/
