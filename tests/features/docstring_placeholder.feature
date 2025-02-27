Feature: User Authentication

  Scenario Outline: User logs in
    Given the system logs the following details:
      """
      Username: <username>
      Password: <password>
      """

    Examples:
      | username  | password      |
      | adminUser | securePass123 |
