from typing import Any

# Question Bank database with standard DSA and coding questions
DUMMY_CODING_QUESTIONS: dict[str, dict[str, Any]] = {
    "Q001": {
        "question_id": "Q001",
        "title": "Sum of Two Numbers",
        "description": "Given two integers, print their sum to standard output.",
        "topic": "Basic Programming",
        "ctc_band": "5-8 LPA",
        "difficulty": "easy",
        "constraints": "1 <= a, b <= 10^9",
        "examples": "Input: 5 10\nOutput: 15",
        "sample_test_cases": [
            {"input": "5 10", "expected_output": "15"},
            {"input": "20 30", "expected_output": "50"}
        ],
        "hidden_test_cases": [
            {"input": "100 200", "expected_output": "300"},
            {"input": "0 50", "expected_output": "50"},
            {"input": "999 1", "expected_output": "1000"}
        ]
    },
    "Q002": {
        "question_id": "Q002",
        "title": "Find Maximum of Three Numbers",
        "description": "Given three integers separated by spaces, find and print the maximum integer.",
        "topic": "Basic Programming",
        "ctc_band": "5-8 LPA",
        "difficulty": "easy",
        "constraints": "-10^9 <= a, b, c <= 10^9",
        "examples": "Input: 10 20 15\nOutput: 20",
        "sample_test_cases": [
            {"input": "10 20 15", "expected_output": "20"},
            {"input": "50 30 40", "expected_output": "50"}
        ],
        "hidden_test_cases": [
            {"input": "1 2 3", "expected_output": "3"},
            {"input": "-10 -5 -20", "expected_output": "-5"},
            {"input": "100 100 50", "expected_output": "100"}
        ]
    },
    "Q003": {
        "question_id": "Q003",
        "title": "Reverse a String",
        "description": "Given a single-line string, print the reversed string.",
        "topic": "Strings",
        "ctc_band": "6-10 LPA",
        "difficulty": "easy",
        "constraints": "1 <= len(s) <= 10^5",
        "examples": "Input: hello\nOutput: olleh",
        "sample_test_cases": [
            {"input": "hello", "expected_output": "olleh"},
            {"input": "world", "expected_output": "dlrow"}
        ],
        "hidden_test_cases": [
            {"input": "racecar", "expected_output": "racecar"},
            {"input": "algorithms", "expected_output": "smhtirogla"}
        ]
    },
    "Q004": {
        "question_id": "Q004",
        "title": "Valid Palindrome",
        "description": "Given a string, return 'true' if it reads the same forwards and backwards (case-insensitive, alphanumeric only), else 'false'.",
        "topic": "Strings",
        "ctc_band": "6-10 LPA",
        "difficulty": "easy",
        "constraints": "1 <= len(s) <= 2 * 10^5",
        "examples": "Input: racecar\nOutput: true",
        "sample_test_cases": [
            {"input": "racecar", "expected_output": "true"},
            {"input": "hello", "expected_output": "false"}
        ],
        "hidden_test_cases": [
            {"input": "madam", "expected_output": "true"},
            {"input": "noon", "expected_output": "true"}
        ]
    },
    "Q005": {
        "question_id": "Q005",
        "title": "Two Sum Indices",
        "description": "Given an array of space-separated integers and a target integer on the second line, print the 0-based indices of the two numbers that add up to the target.",
        "topic": "Arrays & Hashing",
        "ctc_band": "8-14 LPA",
        "difficulty": "easy",
        "constraints": "2 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9",
        "examples": "Input:\n2 7 11 15\n9\nOutput: 0 1",
        "sample_test_cases": [
            {"input": "2 7 11 15\n9", "expected_output": "0 1"},
            {"input": "3 2 4\n6", "expected_output": "1 2"}
        ],
        "hidden_test_cases": [
            {"input": "3 3\n6", "expected_output": "0 1"},
            {"input": "1 5 8 10\n13", "expected_output": "1 2"}
        ]
    },
    "Q006": {
        "question_id": "Q006",
        "title": "Binary Search",
        "description": "Given a sorted array of distinct integers and a target value, return the index of target if found, otherwise return -1.",
        "topic": "Algorithms",
        "ctc_band": "6-10 LPA",
        "difficulty": "easy",
        "constraints": "1 <= nums.length <= 10^4",
        "examples": "Input:\n-1 0 3 5 9 12\n9\nOutput: 4",
        "sample_test_cases": [
            {"input": "-1 0 3 5 9 12\n9", "expected_output": "4"},
            {"input": "-1 0 3 5 9 12\n2", "expected_output": "-1"}
        ],
        "hidden_test_cases": [
            {"input": "5\n5", "expected_output": "0"},
            {"input": "2 4 6 8 10\n8", "expected_output": "3"}
        ]
    },
    "Q007": {
        "question_id": "Q007",
        "title": "Valid Parentheses",
        "description": "Given a string containing just '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
        "topic": "Stacks",
        "ctc_band": "10-16 LPA",
        "difficulty": "medium",
        "constraints": "1 <= s.length <= 10^4",
        "examples": "Input: ()[]{}\nOutput: true",
        "sample_test_cases": [
            {"input": "()[]{}", "expected_output": "true"},
            {"input": "(]", "expected_output": "false"}
        ],
        "hidden_test_cases": [
            {"input": "([{}])", "expected_output": "true"},
            {"input": "((", "expected_output": "false"}
        ]
    },
    "Q008": {
        "question_id": "Q008",
        "title": "Maximum Subarray (Kadane's Algorithm)",
        "description": "Given an integer array nums, find the subarray with the largest sum, and return its sum.",
        "topic": "Dynamic Programming",
        "ctc_band": "12-18 LPA",
        "difficulty": "medium",
        "constraints": "1 <= nums.length <= 10^5, -10^4 <= nums[i] <= 10^4",
        "examples": "Input: -2 1 -3 4 -1 2 1 -5 4\nOutput: 6",
        "sample_test_cases": [
            {"input": "-2 1 -3 4 -1 2 1 -5 4", "expected_output": "6"},
            {"input": "1", "expected_output": "1"}
        ],
        "hidden_test_cases": [
            {"input": "5 4 -1 7 8", "expected_output": "23"},
            {"input": "-1 -2 -3", "expected_output": "-1"}
        ]
    },
    "Q009": {
        "question_id": "Q009",
        "title": "Merge Intervals",
        "description": "Given an array of intervals [start, end], merge all overlapping intervals and return non-overlapping intervals in ascending order.",
        "topic": "Arrays & Intervals",
        "ctc_band": "14-22 LPA",
        "difficulty": "medium",
        "constraints": "1 <= intervals.length <= 10^4",
        "examples": "Input: 1 3, 2 6, 8 10, 15 18\nOutput: [1,6] [8,10] [15,18]",
        "sample_test_cases": [
            {"input": "1 3, 2 6, 8 10, 15 18", "expected_output": "[1,6] [8,10] [15,18]"},
            {"input": "1 4, 4 5", "expected_output": "[1,5]"}
        ],
        "hidden_test_cases": [
            {"input": "1 4, 0 4", "expected_output": "[0,4]"},
            {"input": "1 4, 2 3", "expected_output": "[1,4]"}
        ]
    },
    "Q010": {
        "question_id": "Q010",
        "title": "Trapping Rain Water",
        "description": "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
        "topic": "Two Pointers",
        "ctc_band": "18-28 LPA",
        "difficulty": "hard",
        "constraints": "n == height.length, 1 <= n <= 2 * 10^4",
        "examples": "Input: 0 1 0 2 1 0 1 3 2 1 2 1\nOutput: 6",
        "sample_test_cases": [
            {"input": "0 1 0 2 1 0 1 3 2 1 2 1", "expected_output": "6"},
            {"input": "4 2 0 3 2 5", "expected_output": "9"}
        ],
        "hidden_test_cases": [
            {"input": "2 0 2", "expected_output": "2"},
            {"input": "3 0 0 2 0 4", "expected_output": "10"}
        ]
    }
}


def get_question(question_id: str) -> dict[str, Any] | None:
    """
    Get a coding question using its question_id.
    """
    return DUMMY_CODING_QUESTIONS.get(question_id)


def get_all_questions() -> list[dict[str, Any]]:
    """
    Get all questions in standard format.
    """
    return list(DUMMY_CODING_QUESTIONS.values())


def get_sample_test_cases(question_id: str) -> list[dict[str, str]]:
    """
    Get sample test cases for a question.
    """
    question = get_question(question_id)
    if question is None:
        return []
    return question.get("sample_test_cases", [])


def get_hidden_test_cases(question_id: str) -> list[dict[str, str]]:
    """
    Get hidden test cases for a question.
    """
    question = get_question(question_id)
    if question is None:
        return []
    return question.get("hidden_test_cases", [])