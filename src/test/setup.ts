import axios from 'axios';

// 글로벌 axios mock 설정
jest.mock('axios');

// axios mock 타입 정의 및 글로벌 export
export const mockedAxios = axios as jest.Mocked<typeof axios>;

// 향후 추가될 다른 라이브러리 mock들을 위한 구조
// 예시:
// jest.mock('other-library', () => ({
//   someMethod: jest.fn(),
//   someProperty: 'mocked-value'
// }));

// 글로벌 테스트 설정
beforeEach(() => {
  // 각 테스트 전에 실행될 글로벌 설정
});

afterEach(() => {
  // 각 테스트 후에 실행될 글로벌 정리
});