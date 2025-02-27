Feature: User Authentication

  Rule: Valid Login
    The system should allow valid users to log in.

    Scenario Outline: Successful login
      Given the user enters username "<username>" and password "<password>"
      When the user submits the form
      Then the user should be logged in

      Examples:
        | username  | password      |
        | adminUser | securePass123 |
