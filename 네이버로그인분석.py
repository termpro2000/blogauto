"""
네이버 로그인 페이지 분석 스크립트
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

def analyze_naver_login():
    # Chrome 드라이버 설정
    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    try:
        print("네이버 로그인 페이지 접속...")
        driver.get("https://nid.naver.com/nidlogin.login")
        
        # 페이지 로딩 대기
        time.sleep(3)
        
        print("\n=== 모든 INPUT 요소 분석 ===")
        inputs = driver.find_elements(By.TAG_NAME, "input")
        for i, inp in enumerate(inputs):
            input_type = inp.get_attribute('type')
            input_id = inp.get_attribute('id')
            input_name = inp.get_attribute('name')
            input_class = inp.get_attribute('class')
            input_placeholder = inp.get_attribute('placeholder')
            
            print(f"Input {i}:")
            print(f"  Type: {input_type}")
            print(f"  ID: {input_id}")
            print(f"  Name: {input_name}")
            print(f"  Class: {input_class}")
            print(f"  Placeholder: {input_placeholder}")
            print("---")
        
        print("\n=== 모든 BUTTON 요소 분석 ===")
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for i, btn in enumerate(buttons):
            btn_class = btn.get_attribute('class')
            btn_text = btn.text
            btn_type = btn.get_attribute('type')
            
            print(f"Button {i}:")
            print(f"  Class: {btn_class}")
            print(f"  Text: {btn_text}")
            print(f"  Type: {btn_type}")
            print("---")
        
        print("\n=== 로그인 관련 요소 찾기 ===")
        
        # ID 입력 요소 찾기 시도
        try:
            id_element = driver.find_element(By.ID, "id")
            print(f"ID 입력창 찾음: ID='id', Class='{id_element.get_attribute('class')}'")
        except:
            print("ID='id' 요소를 찾을 수 없음")
        
        # 비밀번호 입력 요소 찾기 시도
        try:
            pw_element = driver.find_element(By.ID, "pw")
            print(f"비밀번호 입력창 찾음: ID='pw', Class='{pw_element.get_attribute('class')}'")
        except:
            print("ID='pw' 요소를 찾을 수 없음")
        
        # 로그인 버튼 찾기 시도
        try:
            login_btn = driver.find_element(By.CSS_SELECTOR, ".btn_login")
            print(f"로그인 버튼 찾음: Class='{login_btn.get_attribute('class')}', Text='{login_btn.text}'")
        except:
            print("Class='btn_login' 버튼을 찾을 수 없음")
        
        # 사용자가 직접 확인할 수 있도록 브라우저 유지
        input("\n페이지를 직접 확인한 후 Enter를 눌러 종료하세요...")
        
    except Exception as e:
        print(f"분석 중 오류 발생: {e}")
    
    finally:
        driver.quit()

if __name__ == "__main__":
    analyze_naver_login()