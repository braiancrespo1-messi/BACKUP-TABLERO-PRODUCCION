import urllib.request, urllib.parse, http.cookiejar

cookie_jar = http.cookiejar.CookieJar()
handler = urllib.request.HTTPCookieProcessor(cookie_jar)
opener = urllib.request.build_opener(handler)

url_login = 'https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F'
data_login = urllib.parse.urlencode({
    'UserName': 'mercadolibre@tmcrespo.com.ar',
    'Password': 'AdministracionMessi',
    'RememberMe': 'true',
    'sid': ''
}).encode('utf-8')

req = urllib.request.Request(url_login, data=data_login, method='POST')
try:
    with opener.open(req) as response:
        print('Status:', response.status)
        print('URL:', response.url)
        print('Cookies in jar:')
        for cookie in cookie_jar:
            print(f'  {cookie.name} = {cookie.value}')
except Exception as e:
    print('Error:', e)
