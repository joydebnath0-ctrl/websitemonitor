import re

with open('/home/ubuntu/control-panel/server.js', 'r') as f:
    content = f.read()

# The CF_TERRAFORM_TEMPLATE uses \\${...} to escape Terraform interpolations
# inside JS template literals. The file may have been saved with \\\\${
# (four backslashes stored, meaning two actual in the string) which then
# causes Node.js to see \\${var.foo} – invalid JS template expression.
# We need exactly \${var.foo} (one backslash + dollar + brace).

# Replace \\${  (two backslashes + dollar in file = literal \\$ in JS string = wrong)
# with \${ (one backslash + dollar in file = literal \$ in JS string = correct escape)
fixed = content.replace('\\\\${var.', '\\${var.')
fixed = fixed.replace('\\\\${data.', '\\${data.')
fixed = fixed.replace('\\\\${aws_', '\\${aws_')

with open('/home/ubuntu/control-panel/server.js', 'w') as f:
    f.write(fixed)

print('Done')
