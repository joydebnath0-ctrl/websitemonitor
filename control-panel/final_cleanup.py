import json

# Reset deployments.json
with open('/home/ubuntu/deployments.json', 'w') as f:
    json.dump([], f)
print("deployments.json reset to []")

# Verify state is empty
with open('/home/ubuntu/terraform.tfstate') as f:
    state = json.load(f)
n = len(state.get('resources', []))
print(f"terraform.tfstate resources remaining: {n}")
print("All clean!" if n == 0 else "WARNING: still has resources!")
