import google.generativeai as genai
import os

# API 키 설정
api_key = 'AIzaSyALE067rGFy5JkVBp0jIYYEvaaajv8kvbU'
genai.configure(api_key=api_key)

# 사용 가능한 모델 목록 확인
print("사용 가능한 Gemini 모델들:")
for model in genai.list_models():
    print(f"- {model.name}")
    if hasattr(model, 'supported_generation_methods'):
        print(f"  지원 방법: {model.supported_generation_methods}")
    print()