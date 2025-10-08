# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

블로그 자동 작성 웹 애플리케이션입니다. 네이버 검색 API와 제미나이 AI를 활용하여 키워드 기반 SEO 최적화 블로그 글을 자동 생성합니다.

## Development Setup

1. 종속성 설치: `npm install`
2. 서버 실행: `npm start` 또는 `npm run dev`
3. 브라우저에서 `http://localhost:3000` 접속

## Common Commands

- `npm start`: 프로덕션 서버 실행
- `npm run dev`: 개발 서버 실행

## Architecture Notes

- **Frontend**: 순수 HTML/CSS/JavaScript (public/index.html)
- **Backend**: Express.js 서버 (server.js)
- **APIs**: 네이버 검색 API, Google 제미나이 API
- **파일 저장**: 검색 결과를 blogtop.txt에 저장

## 주요 기능

1. 키워드 입력 및 API 키 설정
2. 네이버 블로그 검색 (상위 5개 결과)
3. 검색 결과를 blogtop.txt에 저장
4. 제미나이 AI로 SEO 최적화 블로그 글 생성 (2000자 내외)
- claude.md