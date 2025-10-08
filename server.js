const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const cheerio = require('cheerio');

const app = express();
const PORT = 3333;

// Firebase 초기화
try {
    let serviceAccount;
    
    // 1. 환경변수에서 서비스 계정 키 읽기
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('환경변수에서 Firebase 서비스 계정 키를 읽었습니다.');
    } 
    // 2. 로컬 서비스 계정 키 파일 사용
    else {
        try {
            serviceAccount = require('./cleanit-9c968-firebase-adminsdk-fbsvc-e19884eeca.json');
            console.log('로컬 서비스 계정 키 파일을 사용합니다.');
        } catch (fileError) {
            console.log('서비스 계정 키 파일을 찾을 수 없습니다. 로컬 모드로 실행합니다.');
            serviceAccount = null;
        }
    }
    
    // Firebase Admin 초기화
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin이 성공적으로 초기화되었습니다.');
    }
} catch (error) {
    console.log('Firebase 초기화 실패, 로컬 파일 시스템을 사용합니다:', error.message);
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API 키를 불러오는 엔드포인트
app.get('/load-api-keys', async (req, res) => {
    try {
        const apiData = await loadApiKeys();
        res.json({ 
            success: true, 
            apiData: apiData 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            message: 'API 키 파일이 없습니다.' 
        });
    }
});

// AI 프롬프트 관리 API
app.get('/api/prompts', async (req, res) => {
    try {
        let prompts = [];
        
        if (db) {
            const snapshot = await db.collection('aiPrompts').orderBy('createdAt', 'desc').get();
            prompts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } else {
            // 로컬 파일에서 프롬프트 읽기
            try {
                const data = await fs.promises.readFile('prompts.json', 'utf8');
                prompts = JSON.parse(data);
            } catch (error) {
                prompts = [];
            }
        }
        
        res.json({ success: true, prompts });
    } catch (error) {
        console.error('프롬프트 조회 오류:', error);
        res.status(500).json({ error: '프롬프트 조회에 실패했습니다.' });
    }
});

app.post('/api/prompts', async (req, res) => {
    try {
        const { title, content } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ error: '제목과 내용을 모두 입력해주세요.' });
        }
        
        const promptData = {
            title: title,
            content: content,
            createdAt: new Date().toISOString()
        };
        
        if (db) {
            promptData.createdAt = admin.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('aiPrompts').add(promptData);
            console.log('AI 프롬프트가 Firestore에 저장되었습니다:', docRef.id);
        } else {
            // 로컬 파일에 저장
            let prompts = [];
            try {
                const data = await fs.promises.readFile('prompts.json', 'utf8');
                prompts = JSON.parse(data);
            } catch (error) {
                prompts = [];
            }
            
            promptData.id = Date.now().toString();
            prompts.unshift(promptData);
            
            await fs.promises.writeFile('prompts.json', JSON.stringify(prompts, null, 2), 'utf8');
            console.log('AI 프롬프트가 로컬 파일에 저장되었습니다.');
        }
        
        res.json({ success: true, message: 'AI 프롬프트가 저장되었습니다.' });
    } catch (error) {
        console.error('프롬프트 저장 오류:', error);
        res.status(500).json({ error: '프롬프트 저장에 실패했습니다.' });
    }
});

app.put('/api/prompts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ error: '제목과 내용을 모두 입력해주세요.' });
        }
        
        if (db) {
            await db.collection('aiPrompts').doc(id).update({
                title: title,
                content: content,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('AI 프롬프트가 Firestore에서 수정되었습니다:', id);
        } else {
            // 로컬 파일에서 수정
            try {
                const data = await fs.promises.readFile('prompts.json', 'utf8');
                let prompts = JSON.parse(data);
                
                const index = prompts.findIndex(p => p.id === id);
                if (index !== -1) {
                    prompts[index] = {
                        ...prompts[index],
                        title: title,
                        content: content,
                        updatedAt: new Date().toISOString()
                    };
                    
                    await fs.promises.writeFile('prompts.json', JSON.stringify(prompts, null, 2), 'utf8');
                    console.log('AI 프롬프트가 로컬 파일에서 수정되었습니다.');
                } else {
                    return res.status(404).json({ error: '프롬프트를 찾을 수 없습니다.' });
                }
            } catch (error) {
                return res.status(404).json({ error: '프롬프트를 찾을 수 없습니다.' });
            }
        }
        
        res.json({ success: true, message: 'AI 프롬프트가 수정되었습니다.' });
    } catch (error) {
        console.error('프롬프트 수정 오류:', error);
        res.status(500).json({ error: '프롬프트 수정에 실패했습니다.' });
    }
});

app.delete('/api/prompts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (db) {
            await db.collection('aiPrompts').doc(id).delete();
            console.log('AI 프롬프트가 Firestore에서 삭제되었습니다:', id);
        } else {
            // 로컬 파일에서 삭제
            try {
                const data = await fs.promises.readFile('prompts.json', 'utf8');
                let prompts = JSON.parse(data);
                
                const filteredPrompts = prompts.filter(p => p.id !== id);
                
                if (filteredPrompts.length === prompts.length) {
                    return res.status(404).json({ error: '프롬프트를 찾을 수 없습니다.' });
                }
                
                await fs.promises.writeFile('prompts.json', JSON.stringify(filteredPrompts, null, 2), 'utf8');
                console.log('AI 프롬프트가 로컬 파일에서 삭제되었습니다.');
            } catch (error) {
                return res.status(404).json({ error: '프롬프트를 찾을 수 없습니다.' });
            }
        }
        
        res.json({ success: true, message: 'AI 프롬프트가 삭제되었습니다.' });
    } catch (error) {
        console.error('프롬프트 삭제 오류:', error);
        res.status(500).json({ error: '프롬프트 삭제에 실패했습니다.' });
    }
});

// 로그인 API
app.post('/api/login', async (req, res) => {
    try {
        const { id, password } = req.body;
        
        if (!id || !password) {
            return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
        }
        
        let user = null;
        
        if (db) {
            // Firestore에서 사용자 조회
            const snapshot = await db.collection('blogusers')
                .where('id', '==', id)
                .where('password', '==', password)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                user = {
                    id: doc.id,
                    ...doc.data()
                };
            }
        } else {
            // 로컬 파일에서 사용자 조회
            try {
                const data = await fs.promises.readFile('blogusers.json', 'utf8');
                const users = JSON.parse(data);
                user = users.find(u => u.id === id && u.password === password);
            } catch (error) {
                // 파일이 없으면 기본 사용자 생성
                const defaultUsers = [
                    { id: 'mirae', password: 'mirae123', name: 'mirae' },
                    { id: 'james', password: 'james123', name: 'james' }
                ];
                
                await fs.promises.writeFile('blogusers.json', JSON.stringify(defaultUsers, null, 2), 'utf8');
                user = defaultUsers.find(u => u.id === id && u.password === password);
            }
        }
        
        if (user) {
            res.json({
                success: true,
                message: '로그인 성공',
                user: {
                    id: user.id,
                    name: user.name
                }
            });
        } else {
            res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }
        
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    }
});

// 기본 사용자 데이터 초기화 API (개발용)
app.post('/api/init-users', async (req, res) => {
    try {
        const defaultUsers = [
            { id: 'mirae', password: 'mirae123', name: 'mirae' },
            { id: 'james', password: 'james123', name: 'james' }
        ];
        
        if (db) {
            // Firestore에 기본 사용자 추가
            for (const user of defaultUsers) {
                const existingUser = await db.collection('blogusers')
                    .where('id', '==', user.id)
                    .limit(1)
                    .get();
                
                if (existingUser.empty) {
                    await db.collection('blogusers').add({
                        ...user,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('기본 사용자 추가됨:', user.id);
                }
            }
        } else {
            // 로컬 파일에 기본 사용자 저장
            await fs.promises.writeFile('blogusers.json', JSON.stringify(defaultUsers, null, 2), 'utf8');
            console.log('기본 사용자가 로컬 파일에 저장되었습니다.');
        }
        
        res.json({ success: true, message: '기본 사용자 데이터가 초기화되었습니다.' });
    } catch (error) {
        console.error('사용자 초기화 오류:', error);
        res.status(500).json({ error: '사용자 초기화에 실패했습니다.' });
    }
});

// 블로그글 가져오기 API
app.post('/api/fetch-blog-posts', async (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ error: '키워드를 입력해주세요.' });
        }

        console.log(`[DEBUG] 블로그글 가져오기 요청: "${keyword}"`);

        // API 키 로드
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        // 네이버 검색 API 호출
        const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret);
        
        // 블로그 글 내용 추출 (제목과 요약 내용)
        const blogPosts = searchResults.map(item => ({
            title: item.title.replace(/<[^>]*>/g, ''),
            content: item.description.replace(/<[^>]*>/g, ''),
            link: item.link,
            bloggername: item.bloggername,
            postdate: item.postdate
        }));

        console.log(`[DEBUG] ${blogPosts.length}개의 블로그 글을 가져왔습니다`);

        res.json({
            success: true,
            blogPosts: blogPosts,
            keyword: keyword
        });

    } catch (error) {
        console.error('블로그글 가져오기 오류:', error);
        res.status(500).json({ error: '블로그글 가져오기에 실패했습니다.' });
    }
});

// 키워드 조사도구 API 엔드포인트들

// 연관 키워드 분석
app.post('/api/keyword-research/related', async (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ error: '키워드를 입력해주세요.' });
        }

        // 네이버 검색 API를 사용하여 연관 키워드 추출
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret);
        
        // 검색 결과에서 연관 키워드 추출
        const relatedKeywords = extractRelatedKeywords(searchResults, keyword);
        const longTailKeywords = extractLongTailKeywords(relatedKeywords);

        res.json({
            success: true,
            relatedKeywords: relatedKeywords,
            longTailKeywords: longTailKeywords
        });

    } catch (error) {
        console.error('연관 키워드 분석 오류:', error);
        res.status(500).json({ error: '연관 키워드 분석에 실패했습니다.' });
    }
});

// 키워드 경쟁 분석
app.post('/api/keyword-research/competition', async (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ error: '키워드를 입력해주세요.' });
        }

        // 네이버 검색 API를 사용하여 경쟁 분석
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret);
        const analysis = analyzeKeywordCompetition(keyword, searchResults);

        res.json({
            success: true,
            analysis: analysis
        });

    } catch (error) {
        console.error('키워드 경쟁 분석 오류:', error);
        res.status(500).json({ error: '키워드 경쟁 분석에 실패했습니다.' });
    }
});

// 키워드 트렌드 분석
app.post('/api/keyword-research/trends', async (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ error: '키워드를 입력해주세요.' });
        }

        // 네이버 검색 API를 사용하여 트렌드 분석
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret);
        const trends = analyzeKeywordTrends(keyword, searchResults);

        res.json({
            success: true,
            trends: trends
        });

    } catch (error) {
        console.error('키워드 트렌드 분석 오류:', error);
        res.status(500).json({ error: '키워드 트렌드 분석에 실패했습니다.' });
    }
});

// 신규키워드 검색 API 엔드포인트들
app.post('/api/new-keywords/trending', async (req, res) => {
    try {
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        // 트렌딩 키워드 생성
        const trendingKeywords = await generateTrendingKeywords(apiKeys);

        res.json({
            success: true,
            keywords: trendingKeywords
        });

    } catch (error) {
        console.error('트렌딩 키워드 발굴 오류:', error);
        res.status(500).json({ error: '트렌딩 키워드 발굴에 실패했습니다.' });
    }
});

app.post('/api/new-keywords/emerging', async (req, res) => {
    try {
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        // 급상승 키워드 생성
        const emergingKeywords = await generateEmergingKeywords(apiKeys);

        res.json({
            success: true,
            keywords: emergingKeywords
        });

    } catch (error) {
        console.error('급상승 키워드 발굴 오류:', error);
        res.status(500).json({ error: '급상승 키워드 발굴에 실패했습니다.' });
    }
});

app.post('/api/new-keywords/seasonal', async (req, res) => {
    try {
        const apiKeys = await loadApiKeys();
        if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
            return res.status(400).json({ error: '네이버 API 키가 설정되지 않았습니다.' });
        }

        // 계절성 키워드 생성
        const seasonalKeywords = await generateSeasonalKeywords(apiKeys);

        res.json({
            success: true,
            keywords: seasonalKeywords
        });

    } catch (error) {
        console.error('계절성 키워드 발굴 오류:', error);
        res.status(500).json({ error: '계절성 키워드 발굴에 실패했습니다.' });
    }
});

app.post('/search-and-generate', async (req, res) => {
    try {
        const { keyword, aiPrompt, naverClientId, naverClientSecret, claudeApiKey, geminiApiKey } = req.body;

        if (!keyword || !aiPrompt || !naverClientId || !naverClientSecret || !claudeApiKey) {
            return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
        }

        // API 키를 api.txt에 저장
        await saveApiKeys(naverClientId, naverClientSecret, claudeApiKey, geminiApiKey);

        const searchResults = await searchNaverBlogs(keyword, naverClientId, naverClientSecret);
        
        // Firestore 또는 로컬 파일에 검색 결과 저장
        await saveSearchResults(keyword, searchResults, aiPrompt);
        
        let generatedContent;
        try {
            generatedContent = await generateBlogContent(keyword, aiPrompt, claudeApiKey, searchResults);
        } catch (error) {
            console.error('Claude API 실패, 대체 콘텐츠 생성:', error.message);
            generatedContent = generateFallbackContent(keyword, searchResults, aiPrompt);
        }
        
        // 생성된 블로그 글을 Firestore에 저장
        await saveBlogPost(keyword, aiPrompt, searchResults, generatedContent);
        
        res.json({ 
            success: true, 
            message: '블로그 글 생성 완료',
            content: generatedContent,
            searchResults: searchResults
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

async function saveApiKeys(naverClientId, naverClientSecret, claudeApiKey, geminiApiKey) {
    const apiData = {
        naverClientId: naverClientId,
        naverClientSecret: naverClientSecret,
        claudeApiKey: claudeApiKey,
        geminiApiKey: geminiApiKey,
        lastUpdated: new Date().toISOString()
    };
    
    await fs.promises.writeFile('api.txt', JSON.stringify(apiData, null, 2), 'utf8');
    console.log('API 키가 api.txt에 저장되었습니다.');
}

async function loadApiKeys() {
    try {
        const data = await fs.promises.readFile('api.txt', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error('API 키 파일을 찾을 수 없습니다.');
    }
}

async function searchNaverBlogs(keyword, clientId, clientSecret) {
    try {
        const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
            params: {
                query: keyword,
                display: 10,
                start: 1,
                sort: 'sim'
            },
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret
            }
        });

        return response.data.items;
    } catch (error) {
        console.error('네이버 검색 API 오류:', error);
        if (error.response && error.response.status === 401) {
            throw new Error('네이버 API 키가 유효하지 않습니다. 클라이언트 ID와 시크릿을 확인해주세요.');
        } else if (error.response && error.response.status === 429) {
            throw new Error('네이버 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
        } else {
            throw new Error('네이버 검색 API 호출 실패: ' + (error.message || '알 수 없는 오류'));
        }
    }
}

async function saveSearchResults(keyword, searchResults, aiPrompt) {
    const data = {
        keyword: keyword,
        aiPrompt: aiPrompt,
        searchResults: searchResults,
        timestamp: new Date().toISOString()
    };
    
    if (db) {
        data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (db) {
        try {
            await db.collection('searchResults').add(data);
            console.log('검색 결과가 Firestore에 저장되었습니다.');
        } catch (error) {
            console.error('Firestore 저장 실패:', error);
            await saveToBlogTopLocal(searchResults);
        }
    } else {
        await saveToBlogTopLocal(searchResults);
    }
}

async function saveToBlogTopLocal(searchResults) {
    let content = '=== 네이버 블로그 검색 결과 ===\n\n';
    
    searchResults.forEach((item, index) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        content += `${index + 1}. 제목: ${title}\n`;
        content += `   내용: ${description}\n`;
        content += `   링크: ${item.link}\n\n`;
    });

    await fs.promises.writeFile('blogtop.txt', content, 'utf8');
    console.log('검색 결과가 blogtop.txt에 저장되었습니다.');
}

async function saveBlogPost(keyword, aiPrompt, searchResults, generatedContent) {
    const data = {
        keyword: keyword,
        aiPrompt: aiPrompt,
        searchResults: searchResults,
        generatedContent: generatedContent,
        timestamp: new Date().toISOString()
    };
    
    if (db) {
        data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (db) {
        try {
            await db.collection('blogPosts').add(data);
            console.log('블로그 글이 Firestore에 저장되었습니다.');
        } catch (error) {
            console.error('Firestore 저장 실패:', error);
        }
    } else {
        console.log('Firestore를 사용할 수 없어 로컬에만 저장됩니다.');
    }
}

async function generateBlogContent(keyword, aiPrompt, claudeApiKey, searchResults) {
    try {
        const anthropic = new Anthropic({
            apiKey: claudeApiKey,
        });

        // Firestore에서 최근 검색 결과 가져오기 (실패시 로컬 파일 사용)
        let blogTopContent;
        try {
            if (db) {
                console.log(`[DEBUG] Firestore에서 키워드 "${keyword}" 검색 결과 조회 시도`);
                const snapshot = await db.collection('searchResults')
                    .where('keyword', '==', keyword)
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();
                
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    const data = doc.data();
                    console.log(`[DEBUG] Firestore에서 키워드 "${keyword}"의 검색 결과 발견, 프롬프트: "${data.aiPrompt}"`);
                    blogTopContent = formatSearchResultsForPrompt(data.searchResults);
                } else {
                    console.log(`[DEBUG] Firestore에 키워드 "${keyword}"의 검색 결과 없음`);
                    throw new Error('Firestore에 검색 결과 없음');
                }
            } else {
                throw new Error('Firestore 사용 불가');
            }
        } catch (error) {
            console.log(`[DEBUG] Firestore에서 검색 결과 읽기 실패: ${error.message}`);
            console.log(`[DEBUG] 현재 요청의 검색 결과를 직접 사용합니다`);
            // Firestore 실패 시 현재 검색 결과를 직접 사용
            blogTopContent = formatSearchResultsForPrompt(searchResults);
        }
        
        console.log(`[DEBUG] Claude API 호출 준비:`);
        console.log(`[DEBUG] - 키워드: "${keyword}"`);
        console.log(`[DEBUG] - AI 프롬프트: "${aiPrompt}"`);
        console.log(`[DEBUG] - 블로그 콘텐츠 길이: ${blogTopContent.length}자`);
        
        const prompt = `다음은 "${keyword}"에 대한 네이버 블로그 검색 결과입니다:

${blogTopContent}

위의 내용을 참조하여 "${keyword}"에 대한 블로그 글을 작성해주세요.

사용자 요청사항:
${aiPrompt}

기본 요구사항:
1. 네이버 검색 상위 노출을 위한 SEO 최적화 적용
2. 약 2000자 내외의 분량
3. 키워드를 자연스럽게 포함 (키워드 밀도 2-3%)
4. 제목, 소제목 구조 활용
5. 읽기 쉽고 유익한 내용
6. 관련 키워드도 자연스럽게 포함

형식:
- 메인 제목 (H1)
- 소제목들 (H2, H3)
- 본문 내용
- 마무리

사용자의 요청사항을 우선적으로 반영하면서 SEO 최적화 요소도 고려하여 한국어로 작성해주세요.`;

        const message = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 3000,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        return message.content[0].text;

    } catch (error) {
        console.error('Claude API 오류:', error);
        if (error.status === 401) {
            throw new Error('Claude API 키가 유효하지 않습니다. Anthropic Console에서 올바른 API 키를 확인해주세요.');
        } else if (error.status === 429) {
            throw new Error('Claude API 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        } else {
            throw new Error('Claude API 호출 실패: ' + error.message);
        }
    }
}

function formatSearchResultsForPrompt(searchResults) {
    let content = '=== 네이버 블로그 검색 결과 ===\n\n';
    
    searchResults.forEach((item, index) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        content += `${index + 1}. 제목: ${title}\n`;
        content += `   내용: ${description}\n`;
        content += `   링크: ${item.link}\n\n`;
    });
    
    return content;
}

// 키워드 분석 헬퍼 함수들
function extractRelatedKeywords(searchResults, mainKeyword) {
    const keywordMap = new Map();
    const excludeWords = ['블로그', '포스팅', '글', '내용', '정보', '사이트', '페이지', '링크', '이용', '사용', '진행'];
    
    searchResults.forEach(item => {
        const text = (item.title + ' ' + item.description).replace(/<[^>]*>/g, '');
        
        // 다양한 패턴으로 키워드 추출 (대체키워드와 동일한 로직)
        const patterns = [
            /[가-힣]{2,8}/g,           // 2-8글자 한글
            /[가-힣]+\s+[가-힣]+/g,   // 공백으로 연결된 한글
            /[가-힣]+[A-Za-z0-9]+/g,  // 한글+영숫자 조합
            /[A-Za-z0-9]+[가-힣]+/g,  // 영숫자+한글 조합
            /[가-힣]+\([^)]+\)/g      // 괄호가 포함된 키워드
        ];
        
        patterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            matches.forEach(word => {
                const cleanWord = word.trim();
                if (cleanWord !== mainKeyword && 
                    cleanWord.length >= 2 && 
                    cleanWord.length <= 20 &&
                    !excludeWords.some(exclude => cleanWord.includes(exclude))) {
                    
                    const count = keywordMap.get(cleanWord) || 0;
                    keywordMap.set(cleanWord, count + 1);
                }
            });
        });
    });
    
    // 빈도순으로 정렬하여 상위 25개 반환
    return Array.from(keywordMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([keyword, count]) => ({
            keyword: keyword,
            searchVolume: count * 150, // 모의 검색량 (약간 높임)
            competition: count > 3 ? 'high' : count > 1 ? 'medium' : 'low'
        }));
}

function extractLongTailKeywords(relatedKeywords) {
    // 연관 키워드를 조합하여 롱테일 키워드 생성
    const longTailKeywords = [];
    const suffixes = [
        '방법', '추천', '가격', '후기', '비교', '순위', '리뷰', 
        '장점', '단점', '효과', '사용법', '구매', '선택', '정보',
        '업체', '브랜드', '제품', '서비스', '특징', '종류'
    ];
    const prefixes = [
        '최고의', '인기', '추천', '저렴한', '좋은', '베스트', 
        '프리미엄', '전문', '신제품', '할인'
    ];
    
    relatedKeywords.slice(0, 12).forEach((kw, i) => {
        // 기본 후위 조합 (더 다양한 패턴)
        const selectedSuffixes = suffixes.slice(i * 2, i * 2 + 3);
        selectedSuffixes.forEach(suffix => {
            longTailKeywords.push({
                keyword: `${kw.keyword} ${suffix}`,
                searchVolume: Math.floor(kw.searchVolume * 0.3),
                competition: 'low'
            });
        });
        
        // 전위 조합도 추가 (처음 5개 키워드만)
        if (i < 5) {
            const prefix = prefixes[i % prefixes.length];
            longTailKeywords.push({
                keyword: `${prefix} ${kw.keyword}`,
                searchVolume: Math.floor(kw.searchVolume * 0.25),
                competition: 'low'
            });
        }
    });
    
    return longTailKeywords.slice(0, 20);
}

function analyzeKeywordCompetition(keyword, searchResults) {
    const totalResults = searchResults.length;
    const avgTitleLength = searchResults.reduce((sum, item) => 
        sum + item.title.replace(/<[^>]*>/g, '').length, 0) / totalResults;
    
    // 경쟁도 계산
    const competition = totalResults > 4 ? 'high' : totalResults > 2 ? 'medium' : 'low';
    const searchVolume = totalResults * 1000; // 모의 검색량
    const keiScore = Math.floor((searchVolume * searchVolume) / (totalResults * 1000));
    
    // 대체 키워드 제안
    const alternatives = [];
    const uniqueKeywords = new Set();
    
    searchResults.slice(0, 5).forEach(item => {
        const title = item.title.replace(/<[^>]*>/g, '');
        
        // 다양한 패턴으로 키워드 추출
        const patterns = [
            /[가-힣]{2,8}/g,           // 2-8글자 한글
            /[가-힣]+\s+[가-힣]+/g,   // 공백으로 연결된 한글
            /[가-힣]+[A-Za-z0-9]+/g,  // 한글+영숫자 조합
            /[A-Za-z0-9]+[가-힣]+/g,  // 영숫자+한글 조합
            /[가-힣]+\([^)]+\)/g      // 괄호가 포함된 키워드
        ];
        
        patterns.forEach(pattern => {
            const matches = title.match(pattern) || [];
            matches.forEach(word => {
                const cleanWord = word.trim();
                if (cleanWord !== keyword && 
                    cleanWord.length >= 2 && 
                    cleanWord.length <= 20 &&
                    !uniqueKeywords.has(cleanWord)) {
                    
                    uniqueKeywords.add(cleanWord);
                    alternatives.push({
                        keyword: cleanWord,
                        searchVolume: Math.floor(Math.random() * 5000) + 500,
                        competition: Math.random() > 0.5 ? 'medium' : 'low'
                    });
                }
            });
        });
    });
    
    return {
        searchVolume: searchVolume,
        competition: competition,
        keiScore: keiScore,
        difficulty: competition === 'high' ? '높음' : competition === 'medium' ? '중간' : '낮음',
        recommendation: keiScore > 50 ? '추천' : keiScore > 20 ? '보통' : '비추천',
        alternatives: alternatives.slice(0, 5)
    };
}

function analyzeKeywordTrends(keyword, searchResults) {
    // 모의 트렌드 데이터 생성
    const growthRate = Math.floor(Math.random() * 100) - 20; // -20% ~ +80%
    const status = growthRate > 20 ? '상승' : growthRate > 0 ? '안정' : '하락';
    
    // 계절성 분석 (간단한 모의 데이터)
    const seasonality = ['연중 안정', '여름 성수기', '겨울 성수기', '봄/가을 성수기'][Math.floor(Math.random() * 4)];
    
    // 급상승 키워드 생성
    const risingKeywords = [];
    searchResults.slice(0, 3).forEach(item => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const words = title.match(/[가-힣]{2,4}/g) || [];
        
        words.forEach(word => {
            if (word !== keyword && word.length >= 2) {
                risingKeywords.push({
                    keyword: word,
                    growthRate: Math.floor(Math.random() * 200) + 50
                });
            }
        });
    });
    
    return {
        status: status,
        growthRate: growthRate,
        seasonality: seasonality,
        forecast: status === '상승' ? '지속 성장 예상' : status === '안정' ? '현상 유지 예상' : '회복 가능성 있음',
        risingKeywords: risingKeywords.slice(0, 5)
    };
}

function generateFallbackContent(keyword, searchResults, aiPrompt) {
    let content = `# ${keyword}에 대한 종합 가이드\n\n`;
    
    content += `## 개요\n`;
    content += `${keyword}에 대해 알아보겠습니다. 다양한 정보를 통해 ${keyword}의 중요한 측면들을 살펴보겠습니다.\n\n`;
    
    if (aiPrompt) {
        content += `## 작성 방향\n`;
        content += `${aiPrompt}\n\n`;
    }
    
    content += `## 주요 내용\n\n`;
    
    searchResults.forEach((item, index) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        content += `### ${index + 1}. ${title}\n`;
        content += `${description}\n\n`;
        content += `자세한 내용은 [여기서 확인하세요](${item.link})\n\n`;
    });
    
    content += `## 결론\n`;
    content += `${keyword}에 대한 다양한 정보를 살펴보았습니다. 위의 자료들을 참고하여 ${keyword}에 대해 더 깊이 있게 이해할 수 있을 것입니다.\n\n`;
    
    content += `*이 글은 네이버 블로그 검색 결과를 바탕으로 자동 생성되었습니다.*\n`;
    content += `*사용자 요청사항: ${aiPrompt}*\n`;
    content += `*더 정확한 정보를 위해서는 개별 출처를 확인해주세요.*`;
    
    return content;
}

// 제목에서 키워드 추출 함수
function extractKeywordsFromTitle(title) {
    // 불용어 제거
    const stopWords = ['블로그', '포스팅', '글', '내용', '정보', '사이트', '페이지', '링크', '방법', '소개', '리뷰', '후기', '추천', '가격', '비용', '업체', '서비스'];
    
    // 한글 2-6글자 단어 추출
    const words = title.match(/[가-힣]{2,6}/g) || [];
    
    // 불용어 제거 및 중복 제거
    const keywords = [...new Set(words.filter(word => !stopWords.includes(word)))];
    
    // 원본 제목도 키워드로 추가 (20자 이내)
    if (title.length <= 20) {
        keywords.unshift(title);
    }
    
    return keywords.slice(0, 5); // 최대 5개 키워드
}

// 확장된 콘텐츠 생성 함수
function generateExpandedContent(originalTitle, searchResults) {
    let content = `# ${originalTitle}\n\n`;
    
    content += `## 개요\n`;
    content += `"${originalTitle}"와 관련된 다양한 정보를 종합하여 정리했습니다.\n\n`;
    
    if (searchResults.length === 0) {
        content += `관련 정보를 찾을 수 없습니다.\n`;
        return content;
    }
    
    // 검색 결과를 카테고리별로 분류
    const categories = categorizeSearchResults(searchResults);
    
    // 주요 내용 섹션
    content += `## 주요 내용\n\n`;
    
    categories.main.forEach((item, index) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        content += `### ${index + 1}. ${title}\n`;
        content += `${description}\n\n`;
        if (item.bloggername) {
            content += `*출처: ${item.bloggername}*\n`;
        }
        content += `[자세히 보기](${item.link})\n\n`;
    });
    
    // 관련 정보 섹션
    if (categories.related.length > 0) {
        content += `## 관련 정보\n\n`;
        
        categories.related.forEach((item, index) => {
            const title = item.title.replace(/<[^>]*>/g, '');
            const description = item.description.replace(/<[^>]*>/g, '');
            
            content += `**${title}**\n`;
            content += `${description}\n`;
            content += `[링크](${item.link})\n\n`;
        });
    }
    
    // 추가 팁 섹션
    if (categories.tips.length > 0) {
        content += `## 유용한 팁\n\n`;
        
        categories.tips.forEach((item, index) => {
            const description = item.description.replace(/<[^>]*>/g, '');
            content += `- ${description}\n`;
        });
        content += `\n`;
    }
    
    content += `## 결론\n`;
    content += `"${originalTitle}"에 대한 다양한 관점의 정보를 확인했습니다. `;
    content += `각 출처별로 상세한 내용이 다를 수 있으니, 관심 있는 부분은 직접 링크를 방문하여 확인해보시기 바랍니다.\n\n`;
    
    content += `*이 내용은 네이버 블로그 검색 결과를 바탕으로 자동 생성되었습니다.*\n`;
    content += `*총 ${searchResults.length}개의 블로그 글을 참조하였습니다.*`;
    
    return content;
}

// 검색 결과 분류 함수
function categorizeSearchResults(searchResults) {
    const categories = {
        main: [],      // 주요 내용 (상위 3-5개)
        related: [],   // 관련 정보
        tips: []       // 팁이나 조언
    };
    
    searchResults.forEach((item, index) => {
        const title = item.title.replace(/<[^>]*>/g, '').toLowerCase();
        const description = item.description.replace(/<[^>]*>/g, '').toLowerCase();
        
        if (index < 5) {
            categories.main.push(item);
        } else if (title.includes('팁') || title.includes('방법') || description.includes('팁') || description.includes('노하우')) {
            categories.tips.push(item);
        } else {
            categories.related.push(item);
        }
    });
    
    // 최대 개수 제한
    categories.main = categories.main.slice(0, 5);
    categories.related = categories.related.slice(0, 5);
    categories.tips = categories.tips.slice(0, 3);
    
    return categories;
}

// 확장된 블로그 콘텐츠 가져오기 API (스크래핑 대신 키워드 기반 상세 검색)
app.post('/api/fetch-full-content', async (req, res) => {
    try {
        const { url, title } = req.body;
        
        if (!url || !title) {
            return res.status(400).json({ error: 'URL과 제목이 필요합니다.' });
        }

        console.log(`[DEBUG] 확장된 콘텐츠 생성 시도: ${title}`);

        try {
            const apiKeys = await loadApiKeys();
            if (!apiKeys.naverClientId || !apiKeys.naverClientSecret) {
                throw new Error('네이버 API 키가 설정되지 않았습니다.');
            }

            // 제목에서 핵심 키워드 추출
            const cleanTitle = title.replace(/<[^>]*>/g, '').trim();
            const keywords = extractKeywordsFromTitle(cleanTitle);
            console.log(`[DEBUG] 추출된 키워드: ${keywords.join(', ')}`);

            // 여러 키워드로 검색하여 더 많은 정보 수집
            let allSearchResults = [];
            
            for (const keyword of keywords.slice(0, 3)) { // 최대 3개 키워드
                try {
                    const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret);
                    allSearchResults = allSearchResults.concat(searchResults);
                    console.log(`[DEBUG] 키워드 "${keyword}"로 ${searchResults.length}개 결과 추가`);
                } catch (searchError) {
                    console.log(`[DEBUG] 키워드 "${keyword}" 검색 실패: ${searchError.message}`);
                }
            }

            // 중복 제거 (URL 기준)
            const uniqueResults = allSearchResults.filter((result, index, self) => 
                index === self.findIndex(r => r.link === result.link)
            );

            console.log(`[DEBUG] 중복 제거 후 ${uniqueResults.length}개 결과`);

            // 확장된 콘텐츠 생성
            const expandedContent = generateExpandedContent(cleanTitle, uniqueResults);
            
            res.json({
                success: true,
                content: expandedContent,
                source: 'expanded_search',
                length: expandedContent.length,
                searchResultsCount: uniqueResults.length,
                keywords: keywords,
                message: '키워드 기반 확장 검색으로 상세한 내용을 제공합니다.'
            });

        } catch (error) {
            console.error(`[DEBUG] 확장 검색 실패: ${error.message}`);
            
            // 최종 대안: 원본 요약만 제공
            const fallbackContent = `제목: ${title.replace(/<[^>]*>/g, '')}\n\n` +
                                  `원문 링크: ${url}\n\n` +
                                  `※ 전체 원문을 가져올 수 없어 제목 정보만 제공합니다.\n` +
                                  `자세한 내용은 위 링크를 직접 방문해서 확인해주세요.`;
            
            res.json({
                success: true,
                content: fallbackContent,
                source: 'title_only',
                length: fallbackContent.length,
                message: '제목 정보만 제공 가능합니다.'
            });
        }

    } catch (error) {
        console.error('확장된 콘텐츠 가져오기 오류:', error);
        res.status(500).json({ error: '콘텐츠 가져오기에 실패했습니다.' });
    }
});

// 네이버 블로그 원문 직접 스크래핑 API
app.post('/api/scrape-blog-content', async (req, res) => {
    try {
        const { url, title } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL이 필요합니다.' });
        }

        console.log(`[DEBUG] 네이버 블로그 원문 스크래핑 시도: ${url}`);

        try {
            // 네이버 블로그 URL 분석 및 최적화
            let scrapingUrls = [];
            
            if (url.includes('blog.naver.com')) {
                // URL에서 블로그 ID와 로그 번호 추출
                const urlMatch = url.match(/blog\.naver\.com\/([^\/\?]+)(?:\/(\d+))?/);
                if (urlMatch) {
                    const blogId = urlMatch[1];
                    const logNo = urlMatch[2];
                    
                    if (logNo) {
                        // 다양한 URL 패턴 시도
                        scrapingUrls = [
                            `https://m.blog.naver.com/${blogId}/${logNo}`, // 모바일 버전 (가장 효과적)
                            `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&topReferer=https%3A%2F%2Fwww.naver.com%2F`,
                            `https://blog.naver.com/${blogId}/${logNo}`,
                            url
                        ];
                    } else {
                        scrapingUrls = [url];
                    }
                } else {
                    scrapingUrls = [url];
                }
            } else {
                scrapingUrls = [url];
            }

            let bestContent = '';
            let bestSource = '';

            for (const testUrl of scrapingUrls) {
                console.log(`[DEBUG] URL 패턴 시도: ${testUrl}`);
                
                try {
                    const response = await axios.get(testUrl, {
                        timeout: 12000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'Sec-Fetch-Site': 'none',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-User': '?1',
                            'Sec-Fetch-Dest': 'document',
                            'Upgrade-Insecure-Requests': '1',
                            'Connection': 'keep-alive'
                        },
                        maxRedirects: 5,
                        validateStatus: function (status) {
                            return status >= 200 && status < 400; // 리다이렉트도 허용
                        }
                    });

                    console.log(`[DEBUG] 응답 크기: ${response.data.length}자, 상태: ${response.status}`);

                    if (response.data && response.data.length > 1000) {
                        const $ = cheerio.load(response.data);
                        const content = extractBlogContent($, testUrl);
                        
                        if (content.length > bestContent.length && content.length > 100) {
                            bestContent = content;
                            bestSource = testUrl;
                            console.log(`[DEBUG] 더 나은 콘텐츠 발견: ${content.length}자`);
                        }
                    }
                } catch (error) {
                    console.log(`[DEBUG] URL 실패: ${testUrl} - ${error.message}`);
                    continue;
                }
            }

            if (bestContent.length > 100) {
                console.log(`[DEBUG] 스크래핑 성공: ${bestContent.length}자, 소스: ${bestSource}`);
                
                res.json({
                    success: true,
                    content: bestContent,
                    source: 'direct_scraping',
                    sourceUrl: bestSource,
                    length: bestContent.length,
                    message: '네이버 블로그 원문을 성공적으로 추출했습니다.'
                });
            } else {
                throw new Error('충분한 콘텐츠를 추출할 수 없습니다.');
            }

        } catch (scrapingError) {
            console.log(`[DEBUG] 스크래핑 완전 실패: ${scrapingError.message}`);
            
            // 대안: 제목 기반 정보 제공
            const fallbackContent = `제목: ${title ? title.replace(/<[^>]*>/g, '') : '제목 없음'}\n\n` +
                                  `원문 링크: ${url}\n\n` +
                                  `※ 네이버 블로그의 보안 정책으로 인해 원문을 직접 추출할 수 없습니다.\n` +
                                  `위 링크를 클릭하여 원문을 확인해주세요.\n\n` +
                                  `대안으로 키워드 기반 확장 검색을 이용해보세요.`;
            
            res.json({
                success: true,
                content: fallbackContent,
                source: 'fallback_info',
                length: fallbackContent.length,
                message: '원문 추출에 실패하여 기본 정보를 제공합니다.'
            });
        }

    } catch (error) {
        console.error('네이버 블로그 스크래핑 오류:', error);
        res.status(500).json({ error: '블로그 콘텐츠 스크래핑에 실패했습니다.' });
    }
});

// 블로그 콘텐츠 추출 함수 (개선된 버전)
function extractBlogContent($, url) {
    let content = '';
    
    if (url.includes('m.blog.naver.com')) {
        // 모바일 네이버 블로그 전용 선택자
        const mobileSelectors = [
            '.post_ct',
            '.se_component_wrap',
            '.se-module',
            '.se-text',
            '#postListBody',
            '.post-view',
            '.blog-content',
            '.entry-content'
        ];
        
        for (const selector of mobileSelectors) {
            const selectorContent = $(selector).text().trim();
            console.log(`[DEBUG] 모바일 선택자 "${selector}": ${selectorContent.length}자`);
            if (selectorContent.length > content.length) {
                content = selectorContent;
            }
        }
    } else {
        // 데스크톱 네이버 블로그 선택자
        const desktopSelectors = [
            '.se-main-container',
            '.se-component-wrap',
            '.se-module-text',
            '.se-text-paragraph',
            '#postViewArea',
            '.post-view',
            '.blog-content',
            '.entry-content',
            '.post_ct',
            'div[class*="se-"]',
            'div[class*="post"]'
        ];
        
        for (const selector of desktopSelectors) {
            const selectorContent = $(selector).text().trim();
            console.log(`[DEBUG] 데스크톱 선택자 "${selector}": ${selectorContent.length}자`);
            if (selectorContent.length > content.length) {
                content = selectorContent;
            }
        }
    }
    
    // 콘텐츠가 여전히 짧으면 전체 body에서 추출 시도
    if (content.length < 200) {
        const bodyContent = $('body').text();
        console.log(`[DEBUG] body 전체: ${bodyContent.length}자`);
        
        // 불필요한 텍스트 제거
        const cleanContent = bodyContent
            .replace(/블로그|메뉴|로그인|검색|댓글|공유|스크랩|이웃추가|구독|카테고리|태그|방문자|프로필/g, '')
            .replace(/\s+/g, ' ')
            .trim();
            
        if (cleanContent.length > content.length) {
            content = cleanContent;
        }
    }
    
    // 최종 콘텐츠 정리
    content = content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    
    return content;
}

// 스크랩된 글 기반 AI 글 생성 API
app.post('/api/generate-ai-from-scraped', async (req, res) => {
    try {
        const { scrapedContent, aiPrompt, keyword } = req.body;
        
        if (!scrapedContent) {
            return res.status(400).json({ error: '스크랩된 글 내용이 필요합니다.' });
        }

        console.log(`[DEBUG] 스크랩된 글 기반 AI 생성 요청: ${keyword || '키워드 없음'}`);
        console.log(`[DEBUG] 스크랩된 글 길이: ${scrapedContent.length}자`);
        console.log(`[DEBUG] AI 프롬프트 길이: ${aiPrompt ? aiPrompt.length : 0}자`);

        // API 키 로드
        const apiKeys = await loadApiKeys();
        if (!apiKeys.claudeApiKey) {
            return res.status(400).json({ error: 'Claude API 키가 설정되지 않았습니다.' });
        }

        let finalPrompt;
        
        if (!aiPrompt || aiPrompt.trim() === '') {
            // AI 프롬프트가 비어있으면 30% 변경 모드
            finalPrompt = `다음은 블로그 글 내용입니다. 이 글을 기반으로 새로운 글을 작성해주세요.

원본 글:
${scrapedContent}

작업 요청:
1. 원본 글의 구조와 형식을 그대로 유지하세요
2. 제목은 유사하지만 약간 다르게 수정하세요
3. 본문 내용의 약 30%만 다르게 바꾸어 주세요
4. 전체적인 메시지와 정보는 동일하게 유지하세요
5. 자연스럽고 읽기 쉬운 한국어로 작성하세요
6. 약 1500-2000자 분량으로 작성하세요

새로운 블로그 글을 작성해주세요:`;
        } else {
            // AI 프롬프트가 있으면 해당 프롬프트 적용
            finalPrompt = `다음은 스크랩한 블로그 글 내용입니다:

스크랩된 글:
${scrapedContent}

위의 스크랩된 글 내용을 참고하여 다음 요청에 따라 새로운 블로그 글을 작성해주세요:

${aiPrompt}

요구사항:
1. 스크랩된 글의 정보와 내용을 활용하세요
2. 자연스럽고 읽기 쉬운 한국어로 작성하세요
3. 약 1500-2000자 분량으로 작성하세요
4. SEO에 최적화된 구조로 작성하세요

새로운 블로그 글을 작성해주세요:`;
        }

        try {
            const anthropic = new Anthropic({
                apiKey: apiKeys.claudeApiKey,
            });

            console.log(`[DEBUG] Claude API 호출 시작`);

            const message = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 3000,
                messages: [
                    {
                        role: "user",
                        content: finalPrompt
                    }
                ]
            });

            const generatedContent = message.content[0].text;
            console.log(`[DEBUG] AI 글 생성 완료: ${generatedContent.length}자`);

            res.json({
                success: true,
                content: generatedContent,
                source: aiPrompt ? 'custom_prompt' : 'thirty_percent_change',
                originalLength: scrapedContent.length,
                generatedLength: generatedContent.length,
                message: aiPrompt ? 'AI 프롬프트에 따라 글을 생성했습니다.' : '원본 글을 30% 변경하여 새로운 글을 생성했습니다.'
            });

        } catch (error) {
            console.error('Claude API 오류:', error);
            
            // Claude API 실패 시 대체 콘텐츠 생성
            const fallbackContent = generateFallbackFromScraped(scrapedContent, aiPrompt);
            
            res.json({
                success: true,
                content: fallbackContent,
                source: 'fallback',
                message: 'Claude API 실패로 대체 방법으로 글을 생성했습니다.'
            });
        }

    } catch (error) {
        console.error('스크랩 기반 AI 글 생성 오류:', error);
        res.status(500).json({ error: 'AI 글 생성에 실패했습니다.' });
    }
});

// Gemini API 기반 AI 글 생성 API
app.post('/api/generate-gemini-from-scraped', async (req, res) => {
    try {
        const { scrapedContent, aiPrompt, keyword } = req.body;
        
        if (!scrapedContent) {
            return res.status(400).json({ error: '스크랩된 글 내용이 필요합니다.' });
        }

        // API 키 로드
        const apiKeys = await loadApiKeys();
        if (!apiKeys.geminiApiKey) {
            return res.status(400).json({ error: 'Gemini API 키가 설정되지 않았습니다.' });
        }

        console.log(`[DEBUG] Gemini 기반 AI 생성 요청: ${keyword || '키워드 없음'}`);
        console.log(`[DEBUG] 스크랩된 글 길이: ${scrapedContent.length}자`);
        console.log(`[DEBUG] Gemini AI 프롬프트 길이: ${aiPrompt ? aiPrompt.length : 0}자`);

        let finalPrompt;
        
        if (!aiPrompt || aiPrompt.trim() === '') {
            // AI 프롬프트가 비어있으면 30% 변경 모드
            finalPrompt = `다음은 블로그 글 내용입니다. 이 글을 기반으로 새로운 글을 작성해주세요.

원본 글:
${scrapedContent}

요구사항:
1. 원본 글의 핵심 정보와 내용을 유지하면서 약 30% 정도 다르게 표현해주세요
2. 자연스럽고 읽기 쉬운 한국어로 작성하세요
3. 약 1500-2000자 분량으로 작성하세요
4. 제목과 소제목을 포함하여 구조화된 글로 작성하세요
5. SEO에 최적화된 구조로 작성하세요

새로운 블로그 글을 작성해주세요:`;
        } else {
            // AI 프롬프트가 있으면 해당 프롬프트 적용
            finalPrompt = `다음은 스크랩한 블로그 글 내용입니다:

스크랩된 글:
${scrapedContent}

위의 스크랩된 글 내용을 참고하여 다음 요청에 따라 새로운 블로그 글을 작성해주세요:

${aiPrompt}

요구사항:
1. 스크랩된 글의 정보와 내용을 활용하세요
2. 자연스럽고 읽기 쉬운 한국어로 작성하세요
3. 약 1500-2000자 분량으로 작성하세요
4. SEO에 최적화된 구조로 작성하세요

새로운 블로그 글을 작성해주세요:`;
        }

        try {
            console.log(`[DEBUG] Gemini API 호출 시작`);

            // 최신 Gemini API REST 방식 사용
            const geminiResponse = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                {
                    contents: [
                        {
                            parts: [
                                {
                                    text: finalPrompt
                                }
                            ]
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': apiKeys.geminiApiKey
                    }
                }
            );

            const generatedContent = geminiResponse.data.candidates[0].content.parts[0].text;
            console.log(`[DEBUG] Gemini AI 글 생성 완료: ${generatedContent.length}자`);

            res.json({
                success: true,
                content: generatedContent,
                source: aiPrompt ? 'custom_prompt' : 'thirty_percent_change',
                originalLength: scrapedContent.length,
                generatedLength: generatedContent.length,
                message: aiPrompt ? 'Gemini AI 프롬프트에 따라 글을 생성했습니다.' : 'Gemini가 원본 글을 30% 변경하여 새로운 글을 생성했습니다.'
            });

        } catch (geminiError) {
            console.error('Gemini API 오류:', geminiError);
            
            // Gemini API 실패 시 대체 콘텐츠 생성
            const fallbackContent = generateFallbackFromScraped(scrapedContent, aiPrompt);
            
            res.json({
                success: true,
                content: fallbackContent,
                source: 'fallback',
                message: 'Gemini API 실패로 대체 방법으로 글을 생성했습니다.'
            });
        }

    } catch (error) {
        console.error('Gemini 기반 AI 글 생성 오류:', error);
        res.status(500).json({ error: 'Gemini AI 글 생성에 실패했습니다.' });
    }
});

// 스크랩된 글 기반 대체 콘텐츠 생성 함수
function generateFallbackFromScraped(scrapedContent, aiPrompt) {
    let newContent = '';
    
    if (!aiPrompt || aiPrompt.trim() === '') {
        // 30% 변경 모드
        newContent = `# 블로그 글 (재구성)\n\n`;
        newContent += `다음은 참고 자료를 바탕으로 재구성한 내용입니다.\n\n`;
        
        // 원본 내용을 문단별로 나누어 일부 수정
        const paragraphs = scrapedContent.split('\n').filter(p => p.trim().length > 0);
        
        paragraphs.forEach((paragraph, index) => {
            if (index === 0) {
                // 첫 번째 문단은 제목으로 처리
                newContent += `## ${paragraph.replace(/^#+\s*/, '')}\n\n`;
            } else {
                // 나머지 문단들은 약간씩 수정
                let modifiedParagraph = paragraph
                    .replace(/입니다/g, '되어 있습니다')
                    .replace(/했습니다/g, '진행했습니다')
                    .replace(/합니다/g, '하고 있습니다')
                    .replace(/것입니다/g, '상황입니다')
                    .replace(/때문에/g, '이유로')
                    .replace(/그래서/g, '따라서')
                    .replace(/하지만/g, '하지만')
                    .replace(/또한/g, '또한');
                    
                newContent += `${modifiedParagraph}\n\n`;
            }
        });
        
        newContent += `\n*이 글은 참고 자료를 바탕으로 재구성되었습니다.*`;
        
    } else {
        // AI 프롬프트 적용 모드
        newContent = `# 요청에 따른 블로그 글\n\n`;
        newContent += `**작성 요청:** ${aiPrompt}\n\n`;
        newContent += `**참고 자료 기반 내용:**\n\n`;
        newContent += scrapedContent;
        newContent += `\n\n*위 참고 자료를 바탕으로 요청사항에 맞게 재구성이 필요합니다.*`;
    }
    
    return newContent;
}

// 신규키워드 생성 함수들
async function generateTrendingKeywords(apiKeys) {
    try {
        // 트렌딩 키워드 후보들 (시즌, 이벤트, 최신 트렌드 기반)
        const currentMonth = new Date().getMonth() + 1;
        const currentSeason = getCurrentSeason(currentMonth);
        
        const trendingCategories = [
            // 계절성 키워드
            ...getSeasonalKeywords(currentSeason),
            // 일반 트렌딩 키워드
            '스마트폰', '유튜브', '인스타그램', '틱톡', '넷플릭스',
            '배달음식', '홈트레이닝', '온라인쇼핑', '카페', '맛집',
            '여행', '호텔', '펜션', '캠핑', '등산',
            '부동산', '투자', '재테크', '코인', '주식',
            '헬스', '다이어트', '운동', '건강', '영양제',
            '뷰티', '화장품', '스킨케어', '메이크업', '네일',
            '패션', '옷', '신발', '가방', '액세서리',
            '게임', '영화', '드라마', '책', '웹툰'
        ];

        // 각 키워드의 인기도를 측정하기 위해 일부 키워드를 실제로 검색
        const keywordsToCheck = trendingCategories.slice(0, 15);
        const keywordData = [];

        for (const keyword of keywordsToCheck) {
            try {
                const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret, 10);
                keywordData.push({
                    keyword: keyword,
                    searchVolume: searchResults.length * Math.floor(Math.random() * 1000) + 500,
                    growth: `${Math.floor(Math.random() * 50) + 10}%`,
                    popularity: searchResults.length
                });
                
                // API 호출 제한을 위한 지연
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.log(`키워드 ${keyword} 검색 실패:`, error.message);
            }
        }

        // 인기도 기준으로 정렬
        keywordData.sort((a, b) => b.popularity - a.popularity);
        
        return keywordData.slice(0, 12);
        
    } catch (error) {
        console.error('트렌딩 키워드 생성 오류:', error);
        // 오류 시 기본 키워드 반환
        return getDefaultTrendingKeywords();
    }
}

async function generateEmergingKeywords(apiKeys) {
    try {
        // 급상승 가능성이 높은 키워드들
        const emergingCategories = [
            // 테크/AI 관련
            'ChatGPT', 'AI', '인공지능', '메타버스', 'VR', 'AR',
            '블록체인', 'NFT', '웹3', '전기차', '자율주행',
            
            // 라이프스타일
            '제로웨이스트', '비건', '친환경', '미니멀라이프', '디지털디톡스',
            '워라밸', '사이드프로젝트', '부업', '재택근무', '온라인강의',
            
            // 뷰티/패션 트렌드
            '글로우메이크업', '스킨미니멀', 'K뷰티', '비건화장품', '클린뷰티',
            '빈티지패션', '지속가능패션', '업사이클링',
            
            // 푸드 트렌드
            '대체육', '식물성우유', '홈베이킹', '발효음식', '수제맥주',
            '펫푸드', '간편식', '슈퍼푸드', '그릭요거트'
        ];

        const keywordData = [];
        const keywordsToCheck = emergingCategories.slice(0, 12);

        for (const keyword of keywordsToCheck) {
            try {
                const searchResults = await searchNaverBlogs(keyword, apiKeys.naverClientId, apiKeys.naverClientSecret, 5);
                keywordData.push({
                    keyword: keyword,
                    searchVolume: Math.floor(Math.random() * 800) + 200,
                    growth: `+${Math.floor(Math.random() * 200) + 50}%`,
                    trend: '급상승'
                });
                
                await new Promise(resolve => setTimeout(resolve, 150));
            } catch (error) {
                console.log(`급상승 키워드 ${keyword} 검색 실패:`, error.message);
            }
        }

        return keywordData.slice(0, 10);
        
    } catch (error) {
        console.error('급상승 키워드 생성 오류:', error);
        return getDefaultEmergingKeywords();
    }
}

async function generateSeasonalKeywords(apiKeys) {
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentSeason = getCurrentSeason(currentMonth);
        const seasonalKeywords = getSeasonalKeywords(currentSeason);
        
        // 계절별 특화 키워드 추가
        const specialKeywords = getSpecialSeasonalKeywords(currentMonth);
        
        const allSeasonalKeywords = [...seasonalKeywords, ...specialKeywords];
        const keywordData = [];

        for (const keyword of allSeasonalKeywords.slice(0, 10)) {
            keywordData.push({
                keyword: keyword,
                searchVolume: Math.floor(Math.random() * 600) + 300,
                season: currentSeason,
                relevance: Math.floor(Math.random() * 30) + 70 + '%'
            });
        }

        return keywordData;
        
    } catch (error) {
        console.error('계절성 키워드 생성 오류:', error);
        return getDefaultSeasonalKeywords();
    }
}

// 헬퍼 함수들
function getCurrentSeason(month) {
    if (month >= 3 && month <= 5) return '봄';
    if (month >= 6 && month <= 8) return '여름';
    if (month >= 9 && month <= 11) return '가을';
    return '겨울';
}

function getSeasonalKeywords(season) {
    const seasonalMap = {
        '봄': ['벚꽃', '꽃구경', '춘곤증', '봄나들이', '봄옷', '알레르기', '황사', '미세먼지', '새학기', '입학'],
        '여름': ['휴가', '여행', '바다', '수영장', '에어컨', '선크림', '더위', '휴가지', '캠핑', '축제', '빙수', '냉면'],
        '가을': ['단풍', '독서', '등산', '가을여행', '추석', '김장', '감기예방', '겨울준비', '코트', '부츠'],
        '겨울': ['크리스마스', '연말', '신정', '스키', '온천', '히터', '가습기', '목도리', '털옷', '연말모임']
    };
    
    return seasonalMap[season] || [];
}

function getSpecialSeasonalKeywords(month) {
    const specialMap = {
        1: ['신년계획', '다이어트', '헬스장', '금연', '금주', '새해결심'],
        2: ['발렌타인', '졸업', '취업준비', '이사', '봄맞이'],
        3: ['입학준비', '새학기', '꽃가루알레르기', '봄철관리'],
        4: ['벚꽃축제', '나들이', '피크닉', '봄맞이청소'],
        5: ['어린이날', '가정의달', '가족여행', '카네이션'],
        6: ['장마', '습도관리', '여름준비', '휴가계획'],
        7: ['여름휴가', '해수욕장', '물놀이', '선크림'],
        8: ['무더위', '탈수예방', '시원한음료', '에어컨청소'],
        9: ['가을환절기', '감기예방', '새학기준비', '추석준비'],
        10: ['단풍여행', '독서의계절', '등산', '가을옷'],
        11: ['김치담그기', '겨울준비', '난방', '환절기건강'],
        12: ['크리스마스', '연말정리', '새해준비', '겨울용품']
    };
    
    return specialMap[month] || [];
}

function getDefaultTrendingKeywords() {
    return [
        { keyword: '스마트폰', searchVolume: 15000, growth: '25%' },
        { keyword: '배달음식', searchVolume: 12000, growth: '18%' },
        { keyword: '온라인쇼핑', searchVolume: 18000, growth: '30%' },
        { keyword: '홈트레이닝', searchVolume: 8000, growth: '45%' },
        { keyword: '맛집', searchVolume: 22000, growth: '12%' },
        { keyword: '여행', searchVolume: 25000, growth: '35%' },
        { keyword: '부동산', searchVolume: 30000, growth: '8%' },
        { keyword: '재테크', searchVolume: 16000, growth: '22%' },
        { keyword: '다이어트', searchVolume: 14000, growth: '15%' },
        { keyword: '화장품', searchVolume: 19000, growth: '28%' }
    ];
}

function getDefaultEmergingKeywords() {
    return [
        { keyword: 'ChatGPT', searchVolume: 5000, growth: '+180%' },
        { keyword: '메타버스', searchVolume: 3500, growth: '+120%' },
        { keyword: '전기차', searchVolume: 4200, growth: '+95%' },
        { keyword: '비건', searchVolume: 2800, growth: '+150%' },
        { keyword: '제로웨이스트', searchVolume: 1900, growth: '+200%' },
        { keyword: 'NFT', searchVolume: 3100, growth: '+85%' },
        { keyword: '워라밸', searchVolume: 4500, growth: '+110%' },
        { keyword: 'K뷰티', searchVolume: 3300, growth: '+75%' }
    ];
}

function getDefaultSeasonalKeywords() {
    const currentMonth = new Date().getMonth() + 1;
    const season = getCurrentSeason(currentMonth);
    
    return getSeasonalKeywords(season).slice(0, 8).map(keyword => ({
        keyword: keyword,
        searchVolume: Math.floor(Math.random() * 600) + 300,
        season: season,
        relevance: Math.floor(Math.random() * 30) + 70 + '%'
    }));
}

// 루트 경로 라우트 추가
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT}에서 실행 중입니다.`);
});