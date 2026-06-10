import subprocess, json, os

dirs = {
    'EC2': '/home/ubuntu/deployments',
    'VPC': '/home/ubuntu/vpc-deployments',
    'S3': '/home/ubuntu/s3-deployments',
    'CF': '/home/ubuntu/cf-deployments'
}

print("=== deployments.json ===")
try:
    print(open('/home/ubuntu/deployments.json').read())
except: print('(empty)')

print("\n=== vpcs.json ===")
try:
    print(open('/home/ubuntu/vpcs.json').read())
except: print('(empty)')

print("\n=== s3buckets.json ===")
try:
    print(open('/home/ubuntu/s3buckets.json').read())
except: print('(empty)')

print("\n=== distributions.json ===")
try:
    print(open('/home/ubuntu/distributions.json').read())
except: print('(empty)')

print("\n=== Terraform state summary ===")
for svc, base in dirs.items():
    if not os.path.isdir(base):
        continue
    for name in os.listdir(base):
        state = os.path.join(base, name, 'terraform.tfstate')
        if os.path.exists(state):
            try:
                d = json.load(open(state))
                rs = d.get('resources', [])
                print(f"[{svc}] {name}: {len(rs)} resource(s) in state")
                for r in rs:
                    inst = r.get('instances', [{}])[0]
                    rid = inst.get('attributes', {}).get('id', '?')
                    print(f"  - {r['type']} id={rid}")
            except Exception as e:
                print(f"[{svc}] {name}: error reading state: {e}")
        else:
            print(f"[{svc}] {name}: no state file")
