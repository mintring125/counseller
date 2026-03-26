(function attachData() {
  window.APP_DATA = {
    students: [
      { id: 1, name: "김소미", gender: "여" },
      { id: 2, name: "김철호", gender: "남" },
      { id: 3, name: "안세훈", gender: "남" },
      { id: 4, name: "옥승훈", gender: "남" },
      { id: 5, name: "이환희", gender: "남" },
      { id: 6, name: "임선율", gender: "여" },
      { id: 7, name: "전서율", gender: "여" },
      { id: 8, name: "정소윤", gender: "여" },
      { id: 9, name: "최나무", gender: "여" },
      { id: 10, name: "한아윤", gender: "여" },
      { id: 11, name: "황주연", gender: "여" }
    ],
    nominationQuestions: [
      { id: "q1", text: "쉬는 시간에 같이 놀고 싶은 친구는?", category: "positive", maxSelections: 3 },
      { id: "q2", text: "모둠 활동을 할 때 함께하면 좋을 것 같은 친구는?", category: "positive", maxSelections: 3 },
      { id: "q3", text: "내가 힘들거나 속상할 때 이야기하고 싶은 친구는?", category: "positive", maxSelections: 3 },
      { id: "q4", text: "공부하거나 활동할 때 도움을 잘 주는 친구는?", category: "positive", maxSelections: 3 },
      { id: "q5", text: "나를 잘 이해해 준다고 느끼는 친구는?", category: "positive", maxSelections: 3 },
      { id: "q6", text: "요즘 더 자주 같이 지내는 친구는?", category: "positive", maxSelections: 3 },
      { id: "q7", text: "예전보다 더 친해졌다고 느끼는 친구는?", category: "positive", maxSelections: 3 },
      { id: "q8", text: "우리 반에서 친구들에게 친절하게 잘 대해 주는 친구는?", category: "positive", maxSelections: 3 },
      { id: "q9", text: "우리 반에서 두루두루 잘 어울리는 친구는?", category: "positive", maxSelections: 3 },
      { id: "q10", text: "함께 활동할 때 조금 불편하거나 어색한 친구가 있나요?", category: "negative", maxSelections: 3 },
      { id: "q11", text: "같이 있으면 다투거나 의견이 잘 안 맞는 친구가 있나요?", category: "negative", maxSelections: 3 },
      { id: "q12", text: "선생님이 더 살펴보면 좋겠다고 생각하는 친구관계가 있나요?", category: "text", maxSelections: 0 }
    ],
    checkQuestions: [
      { id: "c1", text: "나는 우리 반에 아주 친한 친구가 있다" },
      { id: "c2", text: "나는 우리 반에서 힘들 때 의지할 친구가 있다" },
      { id: "c3", text: "나는 우리 반에서 대체로 편안함을 느낀다" },
      { id: "c4", text: "나는 우리 반 친구들과 잘 어울리는 편이다" }
    ],
    likertLabels: ["아주 그렇다", "그렇다", "보통이다", "그렇지 않다", "전혀 그렇지 않다"]
  };
})();
