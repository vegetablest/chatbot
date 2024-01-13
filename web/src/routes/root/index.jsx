import "./index.css";

import { forwardRef, useContext, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, redirect, useLoaderData, useNavigation, useSubmit } from "react-router-dom";

import Snackbar from "@mui/material/Snackbar";
import MuiAlert from "@mui/material/Alert";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import GitHubIcon from '@mui/icons-material/GitHub';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

import { SnackbarContext } from "contexts/snackbar";
import { ThemeContext } from "contexts/theme";
import { MessageContext } from "contexts/message";
import { WebsocketContext } from "contexts/websocket";

import ChatTab from "./SideMenuButton";


const Alert = forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

export async function loader() {
  const conversations = await fetch("/api/conversations", {
  }).then((res) => res.json());
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastSevenDays = new Date(today);
  lastSevenDays.setDate(lastSevenDays.getDate() - 7);

  const groupedConvs = Object.groupBy(conversations, (item) => {
    const itemDate = new Date(item.updated_at);
    if (itemDate.toDateString() === today.toDateString()) {
      return "Today";
    } else if (itemDate.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else if (itemDate > lastSevenDays) {
      return "Last seven days";
    } else {
      return `${itemDate.toLocaleString("default", { month: "long" })} ${itemDate.getFullYear()}`;
    }
  });
  return { groupedConvs };
}

export async function action({ request }) {
  const conversation = await request.json();
  return redirect(`/conversations/${conversation.id}`);
}

const Root = () => {
  const { groupedConvs } = useLoaderData();
  const { theme } = useContext(ThemeContext);
  const { snackbar, setSnackbar } = useContext(SnackbarContext);
  const navigation = useNavigation();

  const { dispatch } = useContext(MessageContext);
  const submit = useSubmit();
  const [isReady, setIsReady] = useState(false);
  const ws = useRef(null);


  useEffect(() => {
    const conn = () => {
      const wsurl = window.location.origin.replace(/^http/, "ws") + "/api/chat";
      console.debug("connecting to", wsurl);
      ws.current = new WebSocket(wsurl);

      ws.current.onopen = () => {
        console.debug("connected to", wsurl);
        setIsReady(true);
      };
      ws.current.onclose = () => {
        console.debug("connection closed");
        setIsReady(false);
        setTimeout(() => {
          conn();
        }, 1000);
      };
      ws.current.onerror = (err) => {
        console.error("connection error", err);
        ws.current.close();
      };
      ws.current.onmessage = (event) => {
        // <https://react.dev/learn/queueing-a-series-of-state-updates>
        // <https://react.dev/learn/updating-arrays-in-state>
        try {
          const { id, type, conversation, from, content } = JSON.parse(event.data);
          switch (type) {
            case "text":
              dispatch({
                type: "added",
                id: conversation,
                message: { id: id, from: from, content: content, type: "text" },
              });
              break;
            case "stream/start":
              dispatch({
                type: "added",
                id: conversation,
                message: { id: id, from: from, content: content || "", type: "text" },
              });
              break;
            case "stream/text":
              dispatch({
                type: "appended",
                id: conversation,
                message: { id: id, from: from, content: content, type: "text" },
              });
              break;
            case "stream/end":
              break;
            case "info":
              if (content.type === "title-generated") {
                // Using revalidator.revalidate() (<https://reactrouter.com/en/main/hooks/use-revalidator>) does not work here.
                // Maybe because going from convId to the same convId is skipped in shoudRevalidate.
                // So I need to perform an action here.
                submit(
                  { title: content.payload },
                  { method: "put", action: `/conversations/${conversation}`, encType: "application/json" }
                );
              } else {
                console.log("unhandled info message", content);
              }
              break;
            case "error":
              setSnackbar({
                open: true,
                severity: "error",
                message: "Something goes wrong, please try again later.",
              });
              break;
            default:
              console.warn("unknown message type", type);
          }
        } catch (error) {
          console.debug("not a json message", event.data);
        }
      };
    }
    conn();

    return () => {
      ws.current.close();
    };
  }, []);

  const closeSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <WebsocketContext.Provider value={[isReady, ws.current?.send.bind(ws.current)]}>
      <div className={`App theme-${theme}`}>
        <aside className="sidemenu">
          <Link className="sidemenu-button" to="/">
            <AddOutlinedIcon />
            New Chat
          </Link>
          <nav>
            {groupedConvs && Object.entries(groupedConvs).flatMap(([grp, convs]) => (
              [
                <div key={grp}>
                  <div className="sidemenu-date-group">{grp}</div>
                  <ul>
                    {convs.map((conv) => (
                      <li key={conv.id}>
                        <NavLink
                          to={`conversations/${conv.id}`}
                          className={`sidemenu-button ${({ isActive, isPending }) => isActive ? "active" : isPending ? "pending" : ""}`}
                        >
                          {({ isActive, isPending, isTransitioning }) => (
                            <ChatTab chat={conv} isActive={isActive} />
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ]
            ))}
          </nav>
          <hr className="sidemenu-bottom" />
          <div className="sidemenu-bottom-group">
            <div className="sidemenu-bottom-group-items">
              <InfoOutlinedIcon />
            </div>
            <div className="sidemenu-bottom-group-items">
              <a href="https://github.com/edwardzjl/chatbot" target="_blank" rel="noreferrer"> <GitHubIcon /> </a>
            </div>
            <div className="sidemenu-bottom-group-items">
              <a href="mailto:jameszhou2108@hotmail.com">
                <MailOutlineIcon />
              </a>
            </div>
          </div>
        </aside>
        {/* TODO: this loading state will render the delete dialog */}
        <section className={`chatbox ${navigation.state === "loading" ? "loading" : ""}`}>
          <Outlet />
        </section>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={closeSnackbar}
        >
          <Alert
            severity={snackbar.severity}
            sx={{ width: "100%" }}
            onClose={closeSnackbar}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </div>
    </WebsocketContext.Provider>

  );
}

export default Root;