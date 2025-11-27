import styles from "./index.module.css";

import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import PropTypes from "prop-types";
import Icon from "@mui/material/Icon";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ShareIcon from '@mui/icons-material/Share';

import Tooltip from "@/components/Tooltip";
import { Dropdown, DropdownButton, DropdownMenu } from "@/components/DropdownMenu";
import { useConversations } from "@/contexts/conversation/hook";
import { useHttpStream } from "@/contexts/httpstream/hook";
import { useSnackbar } from "@/contexts/snackbar/hook";
import { useDialog } from "@/contexts/dialog/hook";


/**
 *
 * @param {Object} chat
 * @param {string} chat.id
 * @param {string} chat.title
 * @param {boolean} chat.pinned
 * @returns
 */
const ChatTab = ({ chat }) => {
    const navigate = useNavigate();
    const params = useParams();
    const { openDialog } = useDialog();

    const { dispatch } = useConversations();
    const { streamingStatuses, clearConversationStatus } = useHttpStream();
    const { setSnackbar } = useSnackbar();
    const titleRef = useRef(null);
    const [titleText, setTitleText] = useState(chat.title);
    const [titleReadOnly, setTitleReadonly] = useState(true);
    const buttonRef = useRef(null);
    const status = streamingStatuses?.[chat.id];
    const isActive = params.convId === chat.id;
    const showStatusIndicator = Boolean(status) && !isActive;
    const statusLabelMap = {
        running: "Running",
        failed: "Failed",
        completed: "Completed",
    };

    useEffect(() => {
        setTitleText(chat.title);
    }, [chat.title]);

    useEffect(() => {
        if (!titleReadOnly) {
            titleRef.current.focus();
        }
    }, [titleReadOnly]);

    const onTitleClick = (e) => {
        if (!titleReadOnly) {
            // Current editing
            e.stopPropagation();
        }
    };

    const handleKeyDown = async (e) => {
        // <https://developer.mozilla.org/zh-CN/docs/Web/API/Element/keydown_event>
        if (e.isComposing || e.keyCode === 229) {
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            try {
                await renameChat(titleText);
                setTitleReadonly(true);
            } catch (error) {
                setSnackbar({
                    open: true,
                    severity: "error",
                    message: `Error renaming conversation: ${error}`,
                });
            }
        }
    };

    const renameChat = async (title) => {
        const resp = await fetch(`/api/conversations/${chat.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: title }),
        });
        if (!resp.ok) {
            // throw client errors
            throw new Error(`Error renaming conversation: ${resp}`);
        }
    };

    const onUpdateClick = (e) => {
        e.preventDefault();
        setTitleReadonly(false);
        setTimeout(() => titleRef.current.focus(), 100);
    };

    const onSummarizeClick = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/conversations/${chat.id}/summarization`, { method: "POST" });
            const data = await res.json();
            setTitleReadonly(data.title);
        } catch (error) {
            setSnackbar({
                open: true,
                severity: "error",
                message: `Error generating conversation title: ${error}`,
            });
        }
    }

    const handleShareClick = () => {
        openDialog('share-conv-dialog', { convData: chat });
    };

    const handleDeleteClick = () => {
        openDialog('del-conv-dialog', { convData: chat });
    };

    const handleStatusIndicatorClick = () => {
        if (status === "running") {
            return;
        }
        clearConversationStatus(chat.id);
    };

    const flipPin = async (e) => {
        e.preventDefault();
        const resp = await fetch(`/api/conversations/${chat.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                pinned: !chat.pinned,
            }),
        });
        if (!resp.ok) {
            console.error("error updating conversation", resp);
            // TODO: handle error
            // Maybe set snackbar to inform user?
        }
        dispatch({
            type: "reordered",
            conv: { ...chat, pinned: !chat.pinned },
        })
    };

    return (
        <div
            className={`${styles.sidebarButton} ${params.convId === chat.id && styles.active}`}
        >
            <div
                className={styles.titleContainer}
                onClick={() => navigate(`/conversations/${chat.id}`)}
            >
                <Tooltip text={titleText} position="right" offset={{ x: 20 }}>
                    <input
                        aria-label="chat title"
                        ref={titleRef}
                        className={styles.chatTitle}
                        readOnly={titleReadOnly}
                        onKeyDown={handleKeyDown}
                        onBlur={() => { setTitleReadonly(true); setTitleText(chat.title) }} // reset title on blur
                        onClick={onTitleClick}
                        value={titleText}
                        onChange={(e) => setTitleText(e.target.value)}
                    />
                </Tooltip>
            </div>
            {showStatusIndicator ? (
                <Tooltip text={statusLabelMap[status] ?? ""} position="right" offset={{ x: 12 }}>
                    <div className={styles.statusIndicator}>
                        {status === "running" ? (
                            <div className={styles.statusSpinner} aria-label="Conversation streaming in background">
                                {/* ===== 仿照 Tailwind 风格的 SVG 轨迹指示器，突出后台流式状态 ===== */}
                                <svg className={styles.statusSpinnerSvg} viewBox="0 0 16 16">
                                    <circle
                                        className={styles.statusSpinnerCircle}
                                        cx="8"
                                        cy="8"
                                        r="7.333333333333333"
                                    />
                                </svg>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className={styles.statusIndicatorButton}
                                onClick={handleStatusIndicatorClick}
                                title={statusLabelMap[status] ?? ""}
                                aria-label={status === "failed" ? "Dismiss failed status" : "Dismiss completed status"}
                            >
                                <span
                                    className={`${styles.statusDot} ${status === "failed" ? styles.statusDotFailed : styles.statusDotCompleted}`}
                                />
                            </button>
                        )}
                    </div>
                </Tooltip>
            ) : (
                <Dropdown className={styles.chatOpMenu}>
                    <DropdownButton ref={buttonRef} className={styles.chatOpMenuIcon}>
                        <MoreVertIcon />
                    </DropdownButton>
                    <DropdownMenu buttonRef={buttonRef} className={styles.chatOpMenuList}>
                        <li>
                            <button className={styles.chatOpMenuItem} onClick={flipPin}>
                                {chat.pinned ?
                                    <>
                                        <Icon baseClassName="material-symbols-outlined">keep_off</Icon>
                                        <span className={styles.chatOpMenuItemText}>Unpin</span>
                                    </> : <>
                                        <Icon baseClassName="material-symbols-outlined">keep</Icon>
                                        <span className={styles.chatOpMenuItemText}>Pin</span>
                                    </>
                                }
                            </button>
                        </li>
                        <li>
                            <button className={styles.chatOpMenuItem} onClick={onSummarizeClick}>
                                <AutoAwesomeIcon />
                                <span className={styles.chatOpMenuItemText}>Generate title</span>
                            </button>
                        </li>
                        <li>
                            <button className={styles.chatOpMenuItem} onClick={onUpdateClick}>
                                <DriveFileRenameOutlineIcon />
                                <span className={styles.chatOpMenuItemText}>Change title</span>
                            </button>
                        </li>
                        <li>
                            <button className={styles.chatOpMenuItem} onClick={handleShareClick}>
                                <ShareIcon />
                                <span className={styles.chatOpMenuItemText}>Share</span>
                            </button>
                        </li>
                        <li>
                            <button className={styles.chatOpMenuItem} onClick={handleDeleteClick}>
                                <DeleteOutlineIcon />
                                <span className={styles.chatOpMenuItemText}>Delete</span>
                            </button>
                        </li>
                    </DropdownMenu>
                </Dropdown>
            )}
        </div>
    );
};

ChatTab.propTypes = {
    chat: PropTypes.shape({
        id: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        pinned: PropTypes.bool.isRequired,
    }).isRequired,
};

export default ChatTab;
