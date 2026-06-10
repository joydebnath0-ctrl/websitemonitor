import json

# Read main terraform state
try:
    with open('/home/ubuntu/terraform.tfstate') as f:
        state = json.load(f)
    resources = state.get('resources', [])
    print(f"=== Main terraform.tfstate: {len(resources)} resource(s) ===\n")
    for r in resources:
        rtype = r.get('type', '?')
        rname = r.get('name', '?')
        instances = r.get('instances', [])
        for inst in instances:
            attrs = inst.get('attributes', {})
            rid = attrs.get('id', 'N/A')
            # EC2-specific info
            if 'public_ip' in attrs:
                print(f"  [{rtype}.{rname}]")
                print(f"    id         = {rid}")
                print(f"    public_ip  = {attrs.get('public_ip','N/A')}")
                print(f"    instance_state = {attrs.get('instance_state','N/A')}")
                print(f"    tags       = {attrs.get('tags',{})}")
            elif 'tags' in attrs:
                print(f"  [{rtype}.{rname}]")
                print(f"    id    = {rid}")
                print(f"    tags  = {attrs.get('tags',{})}")
            else:
                print(f"  [{rtype}.{rname}] id={rid}")
except Exception as e:
    print(f"Error: {e}")

# Read tfvars
print("\n=== terraform.tfvars ===")
try:
    print(open('/home/ubuntu/terraform.tfvars').read())
except Exception as e:
    print(f"Error: {e}")

# Read main.tf first 30 lines
print("\n=== main.tf (first 40 lines) ===")
try:
    lines = open('/home/ubuntu/main.tf').readlines()
    print(''.join(lines[:40]))
except Exception as e:
    print(f"Error: {e}")
