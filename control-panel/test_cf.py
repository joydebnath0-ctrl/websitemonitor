import urllib.request, json

def get(url):
    return json.loads(urllib.request.urlopen(url).read())

def post(url, data):
    req = urllib.request.Request(url, json.dumps(data).encode(), {'Content-Type':'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(req).read())

print('GET /api/distributions:', get('http://localhost/api/distributions'))
print('GET /api/s3-bucket-names:', get('http://localhost/api/s3-bucket-names'))

p = post('http://localhost/api/cf/preview', {
    'distributionName': 'test-cdn',
    's3BucketName': 'my-test-bucket',
    'priceClass': 'PriceClass_100',
    'httpProtocolPolicy': 'redirect-to-https',
    'defaultTtl': 86400,
    'minTtl': 0,
    'maxTtl': 31536000,
    'originPath': '',
    'compress': True,
    'defaultRootObject': 'index.html'
})
print('POST /api/cf/preview mainTf length:', len(p.get('mainTf','')))
print('POST /api/cf/preview tfVarsJson:')
print(p.get('tfVarsJson',''))
