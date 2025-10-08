"""
Gemini API를 사용한 블로그 글 자동 완성 스크립트
"""

import pandas as pd
import google.generativeai as genai
import os
import time
from typing import List, Optional

class BlogContentGenerator:
    def __init__(self, api_key: str):
        """
        Gemini API를 사용한 블로그 콘텐츠 생성기 초기화
        
        Args:
            api_key (str): Google Gemini API 키
        """
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        self.excel_file = "posting.xlsx"
    
    def read_excel_titles(self) -> pd.DataFrame:
        """
        Excel 파일에서 제목 목록을 읽어오기
        
        Returns:
            pd.DataFrame: 제목과 본문이 포함된 DataFrame
        """
        try:
            print(f"{self.excel_file} 파일을 읽는 중...")
            df = pd.read_excel(self.excel_file)
            print(f"총 {len(df)} 행의 데이터를 발견했습니다.")
            
            # 첫 번째 행이 헤더인지 확인하고 제거
            if df.iloc[0, 0] == "제목":
                df = df.iloc[1:].reset_index(drop=True)
                print("헤더 행을 제거했습니다.")
            
            return df
            
        except FileNotFoundError:
            print(f"오류: {self.excel_file} 파일을 찾을 수 없습니다.")
            raise
        except Exception as e:
            print(f"Excel 파일 읽기 오류: {e}")
            raise
    
    def generate_blog_content(self, title: str) -> str:
        """
        Gemini API를 사용하여 블로그 본문 생성
        
        Args:
            title (str): 블로그 제목
            
        Returns:
            str: 생성된 블로그 본문
        """
        prompt = f"""
        다음 제목으로 블로그 포스트의 본문을 작성해주세요.

        제목: {title}

        요구사항:
        1. 서론-본론-결론 구조로 작성
        2. 독자에게 유용한 정보 제공
        3. 자연스럽고 읽기 쉬운 문체 사용
        4. 적절한 길이 (1000-1500자 정도)
        5. 실용적이고 구체적인 내용 포함

        블로그 본문만 작성해주세요:
        """
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=2000,
                    temperature=0.7,
                )
            )
            
            # API 응답에서 텍스트 추출
            content = response.text
            return content.strip()
            
        except Exception as e:
            print(f"Gemini API 호출 오류: {e}")
            raise
    
    def save_excel(self, df: pd.DataFrame):
        """
        DataFrame을 Excel 파일로 저장
        
        Args:
            df (pd.DataFrame): 저장할 데이터
        """
        try:
            # 헤더 추가
            header_row = pd.DataFrame([["제목", "본문"]], columns=df.columns)
            df_with_header = pd.concat([header_row, df], ignore_index=True)
            
            df_with_header.to_excel(self.excel_file, index=False, header=False)
            print(f"파일이 성공적으로 저장되었습니다: {self.excel_file}")
            
        except Exception as e:
            print(f"Excel 파일 저장 오류: {e}")
            raise
    
    def process_all_titles(self, api_key: str):
        """
        모든 제목에 대해 블로그 본문을 생성하고 Excel에 저장
        
        Args:
            api_key (str): Claude API 키
        """
        try:
            # Excel 파일 읽기
            df = self.read_excel_titles()
            
            # A열(제목)이 비어있지 않은 행들만 처리
            total_rows = len(df[df.iloc[:, 0].notna() & (df.iloc[:, 0] != "")])
            print(f"처리할 제목 수: {total_rows}개")
            
            processed_count = 0
            
            for index, row in df.iterrows():
                title = row.iloc[0] if pd.notna(row.iloc[0]) else ""
                
                # 제목이 비어있으면 건너뛰기
                if not title or title.strip() == "":
                    continue
                
                row_number = index + 2  # Excel에서는 1부터 시작하고 헤더가 있으므로 +2
                print(f"현재 {row_number}행: {title}")
                
                try:
                    # Gemini API로 본문 생성
                    content = self.generate_blog_content(title)
                    
                    # DataFrame의 B열에 본문 저장
                    df.iloc[index, 1] = content
                    
                    processed_count += 1
                    print(f"✓ {row_number}행 완료 ({processed_count}/{total_rows})")
                    
                    # API 호출 간격 조절 (Rate limiting 방지)
                    time.sleep(1)
                    
                except Exception as e:
                    print(f"✗ {row_number}행 처리 실패: {e}")
                    print("다음 행으로 넘어갑니다...")
                    continue
            
            # 수정된 데이터를 Excel 파일에 저장
            print("\n모든 처리가 완료되었습니다. 파일을 저장하는 중...")
            self.save_excel(df)
            
            print(f"\n=== 처리 완료 ===")
            print(f"성공적으로 처리된 행: {processed_count}/{total_rows}")
            
        except Exception as e:
            print(f"전체 프로세스 실행 중 오류 발생: {e}")

def main():
    """
    메인 실행 함수
    """
    # Gemini API 키 설정 (환경변수에서 읽기)
    api_key = os.getenv("GOOGLE_API_KEY")
    
    if not api_key:
        print("오류: GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.")
        print("다음 방법 중 하나를 사용하여 API 키를 설정하세요:")
        print("1. 환경변수 설정: export GOOGLE_API_KEY='your-api-key'")
        print("2. 아래 코드에서 직접 설정:")
        print("   api_key = 'your-api-key-here'")
        
        # 직접 API 키 입력 (보안상 권장하지 않음)
        api_key = input("Gemini API 키를 입력하세요 (또는 Ctrl+C로 종료): ").strip()
        
        if not api_key:
            print("API 키가 입력되지 않았습니다. 프로그램을 종료합니다.")
            return
    
    # 블로그 콘텐츠 생성기 실행
    generator = BlogContentGenerator(api_key)
    generator.process_all_titles(api_key)

if __name__ == "__main__":
    main()