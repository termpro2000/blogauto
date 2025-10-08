"""
블로그 포스팅용 엑셀 파일 생성 스크립트
"""

import pandas as pd
import os

def create_posting_excel():
    """포스팅용 엑셀 파일 생성"""
    try:
        print("블로그 포스팅용 엑셀 파일 생성 중...")
        
        # 현재 작업 디렉토리 확인
        current_dir = os.getcwd()
        file_path = os.path.join(current_dir, "posting.xlsx")
        print(f"파일 경로: {file_path}")
        
        # 많은 사용자가 검색할 법한 블로그 포스팅 제목 샘플
        popular_titles = [
            "2024년 최신 부업 추천 - 집에서 월 100만원 벌기",
            "다이어트 성공 후기 - 3개월 만에 10kg 감량한 비법",
            "ChatGPT 활용법 완벽 가이드 - 업무 효율 200% 향상",
            "부동산 투자 초보자를 위한 완벽 가이드",
            "코딩 독학 로드맵 - 6개월 만에 개발자 되기"
        ]
        
        # 엑셀 데이터 준비
        data = {
            "제목": ["제목"] + popular_titles,
            "본문": ["본문"] + [""] * 5  # 본문은 빈칸으로 남김
        }
        
        # DataFrame 생성
        df = pd.DataFrame(data)
        
        # 엑셀 파일로 저장 (헤더 없이 저장하여 A1부터 데이터가 들어가도록)
        df.to_excel(file_path, index=False, header=False)
        
        print("엑셀 파일 생성 완료!")
        print("파일 내용:")
        print("- A1: 제목, B1: 본문")
        print("- A2~A6: 인기 블로그 포스팅 제목 샘플")
        print("- B2~B6: 빈칸 (본문 작성용)")
        
        # 파일 생성 확인
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            print(f"파일 저장 성공: {file_path} ({file_size} bytes)")
        else:
            print("파일 저장 실패!")
            
    except Exception as e:
        print(f"엑셀 파일 생성 중 오류 발생: {e}")

if __name__ == "__main__":
    create_posting_excel()