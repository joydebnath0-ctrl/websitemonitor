import json, os

# Verify state is empty
with open('/home/ubuntu/terraform.tfstate') as f:
    state = json.load(f)
remaining = len(state.get('resources', []))
print(f"Resources remaining in state: {remaining}")

# Clean up failed EC2 deployment folder
dep_dir = '/home/ubuntu/deployments/test'
if os.path.exists(dep_dir):
    import shutil
    shutil.rmtree(dep_dir)
    print("Removed /home/ubuntu/deployments/test/")

# Reset deployments.json
with open('/home/ubuntu/deployments.json', 'w') as f:
    json.dump([], f)
print("Reset deployments.json to []")

# Clean up temp scripts
for f in ['check_state.py', 'read_state.py']:
    p = f'/home/ubuntu/{f}'
    if os.path.exists(p):
        os.remove(p)
        print(f"Removed {p}")

print("\nAll clean!")
