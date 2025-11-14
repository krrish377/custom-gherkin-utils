@featureTag1
@featureTag2
Feature: Complex splitting

  Background:
    Given a feature-level background

  @ruleTag1
  Rule: Complex rule

    Background:
      Given a rule-level background

    @ruleScenarioTag1
    @ruleScenarioTag2
    Scenario Outline: Complex outline with docstring and table
      Given a user <user>
        """
        user is <user>
        """

      @exTag1
      Examples:
        | user  |
        | Alice |
        | Bob   |

      @exTag2
      Examples:
        | user  |
        | Carol |
