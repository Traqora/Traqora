#328 Add price prediction and fare trend analytics
Repo Avatar
Traqora/Traqora
Description
    Implement machine learning-based price predictions to help users determine optimal booking times and expected price movements.

    ## Files to modify
    - packages/backend/src/services/PriceOracleService.ts
    - packages/client/app/search/
    - packages/backend/src/api/routes/analytics.ts

    ## Out of scope
    - Refactoring unrelated modules
    - Changing public API contracts
    - Major version bumps or breaking changes
    - Performance optimizations not directly related to the issue

    ## Acceptance criteria
    - [ ] Code changes implemented as per procedure steps
    - [ ] All new code has complete type hints
    - [ ] Unit tests added/updated with >90% coverage for changed code
    - [ ] All tests pass: npm test
    - [ ] Linting passes: npm run lint
    - [ ] Type checking passes: npm run typecheck
    - [ ] Documentation updated if needed
    - [ ] Changes reviewed and approved

    ## Procedure
    1. Collect and prepare historical fare data
    2. Train LSTM model for price prediction
    3. Implement prediction API endpoint
    4. Create frontend price trend charts
    5. Add confidence score display
    6. Implement buy/wait recommendations
    7. Set up weekly model retraining
    8. Test prediction accuracy

    #329 Implement referral program with rewards and tracking
Repo Avatar
Traqora/Traqora
Description
    Build a referral system allowing users to invite friends and earn loyalty points or discounts on bookings.

    ## Files to modify
    - packages/backend/src/services/loyalty/store.ts
    - packages/client/app/loyalty/
    - packages/backend/src/api/routes/referrals.ts
    - packages/client/components/

    ## Out of scope
    - Refactoring unrelated modules
    - Changing public API contracts
    - Major version bumps or breaking changes
    - Performance optimizations not directly related to the issue

    ## Acceptance criteria
    - [ ] Code changes implemented as per procedure steps
    - [ ] All new code has complete type hints
    - [ ] Unit tests added/updated with >90% coverage for changed code
    - [ ] All tests pass: npm test
    - [ ] Linting passes: npm run lint
    - [ ] Type checking passes: npm run typecheck
    - [ ] Documentation updated if needed
    - [ ] Changes reviewed and approved

    ## Procedure
    1. Design referral code generation system
    2. Implement referral tracking with attribution
    3. Create reward distribution logic
    4. Build referral dashboard UI
    5. Add fraud detection for abuse prevention
    6. Implement email invitation system
    7. Create tiered reward structure
    8. Test referral conversion flows

    #330 Add support for travel insurance purchases
Repo Avatar
Traqora/Traqora
Description
    Integrate travel insurance options during booking with coverage details and claims management.

    ## Files to modify
    - packages/backend/src/services/bookingOrchestrationService.ts
    - packages/client/app/book/
    - packages/client/components/booking/
    - packages/backend/src/api/routes/insurance.ts

    ## Out of scope
    - Refactoring unrelated modules
    - Changing public API contracts
    - Major version bumps or breaking changes
    - Performance optimizations not directly related to the issue

    ## Acceptance criteria
    - [ ] Code changes implemented as per procedure steps
    - [ ] All new code has complete type hints
    - [ ] Unit tests added/updated with >90% coverage for changed code
    - [ ] All tests pass: npm test
    - [ ] Linting passes: npm run lint
    - [ ] Type checking passes: npm run typecheck
    - [ ] Documentation updated if needed
    - [ ] Changes reviewed and approved

    ## Procedure
    1. Integrate third-party insurance provider API
    2. Design insurance product catalog
    3. Implement premium calculation logic
    4. Create insurance selection UI in booking flow
    5. Generate insurance policy PDFs
    6. Build claims submission portal
    7. Add insurance status to itinerary
    8. Test insurance purchase and claims flows

    #331 Implement chat support with AI-powered assistance
Repo Avatar
Traqora/Traqora
Description
    Add an in-app chat support system with AI chatbot for common queries and human agent escalation.

    ## Files to modify
    - packages/client/components/
    - packages/backend/src/services/
    - packages/backend/src/websockets/
    - packages/client/hooks/

    ## Out of scope
    - Refactoring unrelated modules
    - Changing public API contracts
    - Major version bumps or breaking changes
    - Performance optimizations not directly related to the issue

    ## Acceptance criteria
    - [ ] Code changes implemented as per procedure steps
    - [ ] All new code has complete type hints
    - [ ] Unit tests added/updated with >90% coverage for changed code
    - [ ] All tests pass: npm test
    - [ ] Linting passes: npm run lint
    - [ ] Type checking passes: npm run typecheck
    - [ ] Documentation updated if needed
    - [ ] Changes reviewed and approved

    ## Procedure
    1. Set up WebSocket server for real-time chat
    2. Implement AI chatbot with NLP capabilities
    3. Create chat UI component with message history
    4. Add human agent escalation flow
    5. Implement file attachment support
    6. Add agent availability indicators
    7. Create post-chat survey system
    8. Test chat functionality end-to-end

