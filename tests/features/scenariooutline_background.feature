@smoke
@login
Feature: User Login

  Background:
    Given the user is on the login page

  Scenario Outline: Login with <username>
    Given I enter "<username>" in the username field
    And I enter "<password>" in the password field
    Then I should see the dashboard

    Examples:
      | username | password |
      | user1    | pass123  |
