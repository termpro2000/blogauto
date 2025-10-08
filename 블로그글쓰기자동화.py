"""
네이버 블로그 자동 포스팅 스크립트
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
import pyperclip
import time

class NaverBlogAutomate:
    def __init__(self):
        # 네이버 계정 정보
        self.naver_id = "termpro2000"
        self.naver_password = "yhsABOqaz"
        
        # Chrome 드라이버 설정
        chrome_options = webdriver.ChromeOptions()
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # 대기 객체 설정
        self.wait = WebDriverWait(self.driver, 20)
    
    def login_to_naver(self):
        """네이버 로그인 수행"""
        try:
            # 네이버 로그인 페이지 접속
            print("네이버 로그인 페이지 접속...")
            self.driver.get("https://nid.naver.com/nidlogin.login")
            
            # 페이지 로딩 대기
            time.sleep(2)
            
            # 아이디 입력창 클릭 및 입력
            print("아이디 입력 중...")
            id_input = self.wait.until(EC.element_to_be_clickable((By.ID, "id")))
            id_input.click()
            
            # 클립보드에 아이디 복사 후 붙여넣기
            pyperclip.copy(self.naver_id)
            id_input.send_keys(Keys.CONTROL + 'v')
            
            time.sleep(1)
            
            # 비밀번호 입력창 클릭 및 입력
            print("비밀번호 입력 중...")
            pw_input = self.wait.until(EC.element_to_be_clickable((By.ID, "pw")))
            pw_input.click()
            
            # 클립보드에 비밀번호 복사 후 붙여넣기
            pyperclip.copy(self.naver_password)
            pw_input.send_keys(Keys.CONTROL + 'v')
            
            time.sleep(1)
            
            # 로그인 버튼 클릭
            print("로그인 버튼 클릭...")
            # 여러 로그인 버튼 셀렉터 시도
            login_selectors = [
                ".btn_login",
                ".btn_login.off.next_step.nlog-click",
                "button[type='submit']",
                ".btn_login.off",
                "button.btn_login"
            ]
            
            login_clicked = False
            for selector in login_selectors:
                try:
                    login_btn = self.driver.find_element(By.CSS_SELECTOR, selector)
                    login_btn.click()
                    print(f"로그인 버튼 클릭 성공! (셀렉터: {selector})")
                    login_clicked = True
                    break
                except:
                    continue
            
            if not login_clicked:
                print("로그인 버튼을 찾을 수 없습니다.")
            
            # 로그인 완료 대기
            time.sleep(2)
            print("로그인 완료!")
            
        except Exception as e:
            print(f"로그인 중 오류 발생: {e}")
            raise
    
    def navigate_to_blog_write(self):
        """블로그 글쓰기 페이지로 이동"""
        try:
            print("블로그 글쓰기 페이지로 이동...")
            self.driver.get("https://blog.naver.com/GoBlogWrite.naver")
            
            # 페이지 로딩 대기
            time.sleep(3)
            print("블로그 글쓰기 페이지 이동 완료!")
            
        except Exception as e:
            print(f"블로그 페이지 이동 중 오류 발생: {e}")
            raise
    
    def switch_to_main_frame(self):
        """메인 iframe으로 전환"""
        try:
            print("메인 iframe으로 전환...")
            # 여러 가능한 iframe 셀렉터 시도
            iframe_selectors = ["#mainFrame", "iframe[name='mainFrame']", "iframe"]
            
            iframe_found = False
            for selector in iframe_selectors:
                try:
                    print(f"iframe 셀렉터 시도: {selector}")
                    main_frame = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
                    self.driver.switch_to.frame(main_frame)
                    time.sleep(2)
                    print(f"iframe 전환 완료! (셀렉터: {selector})")
                    iframe_found = True
                    break
                except:
                    print(f"셀렉터 {selector} 실패, 다음 시도...")
                    continue
            
            if not iframe_found:
                print("iframe을 찾을 수 없습니다. 기본 창에서 계속 진행...")
                
        except Exception as e:
            print(f"iframe 전환 중 오류 발생: {e}")
            print("기본 창에서 계속 진행...")
    
    def close_popups(self):
        """팝업 창 닫기"""
        try:
            print("팝업 닫기 시도...")
            
            # 첫 번째 팝업 닫기 시도
            try:
                cancel_button = self.driver.find_element(By.CSS_SELECTOR, '.se-popup-button-cancel')
                if cancel_button:
                    cancel_button.click()
                    print("첫 번째 팝업 닫기 완료")
                    time.sleep(1)
            except:
                print("첫 번째 팝업이 없거나 이미 닫혀있음")
            
            # 두 번째 팝업 닫기 시도
            try:
                help_close_button = self.driver.find_element(By.CSS_SELECTOR, '.se-help-panel-close-button')
                if help_close_button:
                    help_close_button.click()
                    print("두 번째 팝업 닫기 완료")
                    time.sleep(1)
            except:
                print("두 번째 팝업이 없거나 이미 닫혀있음")
                
        except Exception as e:
            print(f"팝업 닫기 중 오류 발생: {e}")
    
    def input_title(self):
        """제목 입력"""
        try:
            print("제목 입력 중...")
            # 여러 가능한 제목 셀렉터 시도
            title_selectors = [
                ".se-section-documentTitle",
                "[data-testid='title-input']",
                "input[placeholder*='제목']",
                ".title-input",
                "#title",
                "input[name='title']"
            ]
            
            title_found = False
            for selector in title_selectors:
                try:
                    print(f"제목 셀렉터 시도: {selector}")
                    title_element = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, selector)))
                    title_element.click()
                    time.sleep(1)
                    
                    # ActionChains를 사용하여 한 글자씩 입력
                    actions = ActionChains(self.driver)
                    title_text = "제목텍스트"
                    
                    for char in title_text:
                        actions.send_keys(char)
                        actions.perform()
                        time.sleep(0.03)
                    
                    print(f"제목 입력 완료! (셀렉터: {selector})")
                    title_found = True
                    break
                except:
                    print(f"셀렉터 {selector} 실패, 다음 시도...")
                    continue
            
            if not title_found:
                print("제목 입력창을 찾을 수 없습니다.")
            
        except Exception as e:
            print(f"제목 입력 중 오류 발생: {e}")
    
    def input_content(self):
        """본문 입력"""
        try:
            print("본문 입력 중...")
            # 여러 가능한 본문 셀렉터 시도
            content_selectors = [
                ".se-section-text",
                "[data-testid='content-editor']",
                ".content-editor",
                "[contenteditable='true']",
                "textarea[placeholder*='내용']",
                ".editor-content"
            ]
            
            content_found = False
            for selector in content_selectors:
                try:
                    print(f"본문 셀렉터 시도: {selector}")
                    content_element = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, selector)))
                    content_element.click()
                    time.sleep(1)
                    
                    # 5줄의 동일한 내용 입력
                    content_text = "안녕하세요. 내용을 입력하고 있습니다."
                    
                    for line_num in range(5):
                        print(f"{line_num + 1}줄 입력 중...")
                        actions = ActionChains(self.driver)
                        
                        # 한 글자씩 입력
                        for char in content_text:
                            actions.send_keys(char)
                            actions.perform()
                            time.sleep(0.03)
                        
                        # 줄바꿈 (마지막 줄이 아닌 경우)
                        if line_num < 4:
                            actions.send_keys(Keys.RETURN)
                            actions.perform()
                            time.sleep(0.03)
                    
                    print(f"본문 입력 완료! (셀렉터: {selector})")
                    content_found = True
                    break
                except:
                    print(f"셀렉터 {selector} 실패, 다음 시도...")
                    continue
            
            if not content_found:
                print("본문 입력창을 찾을 수 없습니다.")
            
        except Exception as e:
            print(f"본문 입력 중 오류 발생: {e}")
    
    def save_post(self):
        """포스트 저장"""
        try:
            print("저장 버튼 클릭...")
            # 여러 가능한 저장 버튼 셀렉터 시도
            save_selectors = [
                ".save_btn__bzc5B",
                "[data-testid='save-button']",
                "button[title='저장']",
                "button:contains('저장')",
                ".btn-save",
                "#save-btn"
            ]
            
            save_found = False
            for selector in save_selectors:
                try:
                    print(f"저장 버튼 셀렉터 시도: {selector}")
                    save_button = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, selector)))
                    save_button.click()
                    time.sleep(2)
                    print(f"포스트 저장 완료! (셀렉터: {selector})")
                    save_found = True
                    break
                except:
                    print(f"셀렉터 {selector} 실패, 다음 시도...")
                    continue
            
            if not save_found:
                print("저장 버튼을 찾을 수 없습니다.")
            
        except Exception as e:
            print(f"저장 중 오류 발생: {e}")
    
    def debug_page_structure(self):
        """페이지 구조 디버깅"""
        try:
            print("현재 페이지 구조 분석 중...")
            
            # 모든 input 요소 찾기
            inputs = self.driver.find_elements(By.TAG_NAME, "input")
            print(f"Input 요소 개수: {len(inputs)}")
            for i, inp in enumerate(inputs[:5]):  # 처음 5개만 출력
                print(f"Input {i}: class='{inp.get_attribute('class')}', placeholder='{inp.get_attribute('placeholder')}', name='{inp.get_attribute('name')}'")
            
            # 모든 button 요소 찾기
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            print(f"Button 요소 개수: {len(buttons)}")
            for i, btn in enumerate(buttons[:5]):  # 처음 5개만 출력
                print(f"Button {i}: class='{btn.get_attribute('class')}', text='{btn.text}'")
            
            # 모든 textarea 요소 찾기
            textareas = self.driver.find_elements(By.TAG_NAME, "textarea")
            print(f"Textarea 요소 개수: {len(textareas)}")
            for i, ta in enumerate(textareas[:5]):  # 처음 5개만 출력
                print(f"Textarea {i}: class='{ta.get_attribute('class')}', placeholder='{ta.get_attribute('placeholder')}'")
                
        except Exception as e:
            print(f"페이지 구조 분석 중 오류: {e}")

    def run(self):
        """자동화 실행"""
        try:
            self.login_to_naver()
            self.navigate_to_blog_write()
            
            # 페이지 구조 디버깅
            self.debug_page_structure()
            
            self.switch_to_main_frame()
            self.close_popups()
            self.input_title()
            self.input_content()
            self.save_post()
            
            print("블로그 자동 포스팅 완료! 브라우저가 열린 상태로 유지됩니다.")
            
            # 사용자가 수동으로 브라우저를 닫을 때까지 대기
            input("작업을 마치셨으면 Enter를 눌러 브라우저를 종료하세요...")
            
        except Exception as e:
            print(f"실행 중 오류 발생: {e}")
        
        finally:
            self.driver.quit()

if __name__ == "__main__":
    # 블로그 자동화 실행
    blog_auto = NaverBlogAutomate()
    blog_auto.run()