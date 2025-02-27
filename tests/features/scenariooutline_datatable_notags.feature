Feature: Data Table Handling

  Scenario Outline: Verify user data table
    Given the following users exist
      | name  | age |
      | Alice | 25  |
      | Bob   | 30  |
    Then the system should validate the users <query>

    Examples:
      | query                   |
      | isRegistered hasProfile |
