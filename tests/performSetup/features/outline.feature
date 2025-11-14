Feature: Outline splitting

  Scenario Outline: Login with different users
    Given a user <user>

    Examples:
      | user  |
      | Alice |
      | Bob   |
