@sanity
Feature: Doc String Test

  Scenario: Error Message Handling
    Then I should see the following error:
      """
      Invalid username or password.
      Please try again.
      """
