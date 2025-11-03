import json
import urllib.request

url = 'http://127.0.0.1:5000/api/visits'
payload = {
    "staff": "테스트 사용자",
    "visits": [
        {
            "visitDate": "2025-10-23",
            "staff": "테스트 사용자",
            "region": "서울",
            "school": "테스트고등학교",
            "visitStart": "09:00",
            "visitEnd": "09:30",
            "subjects": [
                {"subject":"정보","teacher":"김선생","conversation":"샘플 대화","followUp":"재방문 예정","contact":"010-1234-5678","meetings":["명함인사"]}
            ]
        }
    ]
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type':'application/json'})
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print('HTTP', resp.getcode())
        body = resp.read().decode('utf-8')
        print(body)
except Exception as e:
    print('ERROR:', e)
    raise
