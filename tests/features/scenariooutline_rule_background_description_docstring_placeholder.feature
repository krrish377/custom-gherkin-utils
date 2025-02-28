@featureTag
Feature: Demonstrate backgrounds at both feature and rule levels
  feature description

  Background: Background name1
    background description

    Given the system is in a valid initial state at the feature level

  @ruleTag
  Rule: Basic rule demonstration
    This rule ensures that user behaviors follow a certain pattern.

    Background: background inside rule
      Given the system is further set up for this rule

    @scenarioOutlineTag
    Scenario Outline: Perform multiple actions with different outcomes
      I am scenario's description

      Given I am on the <page> page
      When I perform <action>
      Then I should see <outcome>
      And the system logs the following details:
        ```
        Page: <page>
        Outcome: <outcome>
        Action: <action>
        ```

      Examples:
        | page | action        | outcome                  |
        | Home | click "Login" | the login screen appears |
