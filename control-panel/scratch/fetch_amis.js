const { execSync } = require('child_process');

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-central-1", "ap-south-1", "ap-southeast-1", "ap-northeast-1"
];

const PARAMETERS = {
  "ami-ubuntu-26-x86": "/aws/service/canonical/ubuntu/server/resolute/stable/current/amd64/hvm/ebs-gp3/ami-id",
  "ami-ubuntu-26-arm": "/aws/service/canonical/ubuntu/server/resolute/stable/current/arm64/hvm/ebs-gp3/ami-id",
  "ami-ubuntu-24-x86": "/aws/service/canonical/ubuntu/server/noble/stable/current/amd64/hvm/ebs-gp3/ami-id",
  "ami-ubuntu-24-arm": "/aws/service/canonical/ubuntu/server/noble/stable/current/arm64/hvm/ebs-gp3/ami-id"
};

const map = {
  "ami-ubuntu-26-x86": {},
  "ami-ubuntu-26-arm": {},
  "ami-ubuntu-24-x86": {},
  "ami-ubuntu-24-arm": {}
};

console.log("Starting AMI query for all regions...");

for (const region of REGIONS) {
  console.log(`Querying region: ${region}`);
  for (const [key, param] of Object.entries(PARAMETERS)) {
    try {
      const output = execSync(
        `aws ssm get-parameters --names "${param}" --query "Parameters[0].Value" --output text --region ${region} --profile boozeverse`,
        { encoding: 'utf8' }
      ).trim();
      if (output && output !== 'None' && output.startsWith('ami-')) {
        map[key][region] = output;
      } else {
        map[key][region] = "not-available";
      }
    } catch (e) {
      console.error(`Error querying ${key} in ${region}: ${e.message}`);
      map[key][region] = "error";
    }
  }
}

console.log("\nCopy and paste this mapping into app.js:\n");
console.log(JSON.stringify(map, null, 2));
