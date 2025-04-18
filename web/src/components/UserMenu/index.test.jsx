import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { UserContext } from "@/contexts/user";

import UserMenu from "./index";

const setup = () => render(
    <UserContext.Provider value={mockUserContextValue}>
        <UserMenu />
    </UserContext.Provider>
);

const mockUserContextValue = {
    username: "testuser",
    avatar: "testavatar.png",
};

describe("ChatboxHeader", () => {
    it("renders the username and avatar", () => {
        setup();
        expect(screen.getByAltText("testuser's avatar")).toBeDefined();
        expect(screen.getByText("testuser")).toBeDefined();
    });

    it("handles logout", () => {
        setup();
        delete window.location;
        window.location = { href: "" };
        fireEvent.click(screen.getByText("Logout"));
        expect(window.location.href).toBe("/oauth2/sign_out");
    });
});
